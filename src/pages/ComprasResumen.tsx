import {
  PANTALLA_ANTICIPAR_COMPRAS, PANTALLA_FACTURAS_COMPRAS, PANTALLA_FACTURAS_SRI,
  PANTALLA_NO_DEDUCIBLES, PANTALLA_NOTAS_VENTA,
} from "../utils/permisosAplicacion"
import "./comprasResumen.css"

export type Tarjeta = { nombre: string; ruta: string; descripcion?: string; pendiente?: boolean; icono: string }

const iconoFactura = "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"
const secciones = [
  { nombre: "Materias primas y empaques", ruta: "Materias Primas y Empaques", descripcion: "Consulta y actualiza el catálogo de insumos.", icono: "m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10" },
  { nombre: "Proveedores", ruta: "Proveedores", pendiente: true, icono: "M3 8h11v9H3zm11 3h4l3 3v3h-7M6 17v3m12-3v3" },
  { nombre: "Costos", ruta: "Costos", pendiente: true, icono: "M12 3v18m4-14H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7" },
  { nombre: "Kardex", ruta: "Kardex", descripcion: "Revisa saldos y movimientos de inventario.", icono: "M5 4h14v16H5zM9 4v16m3-11h4m-4 5h4" },
  { nombre: "Historial", ruta: "Historial", pendiente: true, icono: "M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l4 2" },
  { nombre: "Análisis", ruta: "Análisis", pendiente: true, icono: "M4 4v16h16M8 16v-4m4 4V8m4 8V5" },
].map(seccion => ({ ...seccion, ruta: `Compras · ${seccion.ruta}` }))

const tarjetasCompras: Tarjeta[] = [
  { nombre: "Compras por anticipar", ruta: PANTALLA_ANTICIPAR_COMPRAS, descripcion: "Revisa el stock y la cobertura para priorizar pedidos.", icono: "M5 4h14v16H5zM8 2v4m8-4v4M5 9h14m-9 5 2 2 4-4" },
  { nombre: "Facturas de compras", ruta: PANTALLA_FACTURAS_COMPRAS, descripcion: "Abre las secciones de documentos de compra.", icono: iconoFactura },
  ...secciones,
]

const tarjetasFacturas: Tarjeta[] = [
  { nombre: "Facturas SRI", ruta: PANTALLA_FACTURAS_SRI, descripcion: "Gestiona los XML y los RIDE de las facturas recibidas.", icono: iconoFactura },
  { nombre: "Notas de venta", ruta: PANTALLA_NOTAS_VENTA, descripcion: "Consulta las notas de venta registradas en contabilidad.", icono: "M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h8m-8 4h4" },
  { nombre: "Gastos no deducibles", ruta: PANTALLA_NO_DEDUCIBLES, descripcion: "Consulta los movimientos de la cuenta de gastos no deducibles.", icono: "M5 4h14v16H5zM9 4v16m3-11h4m-4 5h4" },
]

export default function ComprasResumen({ facturas, puedeAcceder, cambiarPantalla }: {
  facturas: boolean
  puedeAcceder: (pantalla: string) => boolean
  cambiarPantalla: (pantalla: string) => void
}) {
  const titulo = facturas ? "Facturas de compras" : "Compras"
  const tarjetas = (facturas ? tarjetasFacturas : tarjetasCompras).filter(seccion => puedeAcceder(seccion.ruta))

  return <MenuTarjetas titulo={titulo} tarjetas={tarjetas} cambiarPantalla={cambiarPantalla} />
}

export function MenuTarjetas({ titulo, tarjetas, cambiarPantalla }: {
  titulo: string
  tarjetas: Tarjeta[]
  cambiarPantalla: (pantalla: string) => void
}) {
  return (
    <div className="compras-resumen">
      <header className="compras-cabecera">
        <h1>{titulo}</h1>
      </header>
      <nav className="compras-tarjetas" aria-label={`Secciones de ${titulo}`}>
        {tarjetas.map(({ ruta, nombre, descripcion, pendiente, icono }) => (
          <button key={ruta} type="button" className="compras-tarjeta" onClick={() => cambiarPantalla(ruta)}>
            <span className="compras-icono"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icono} /></svg></span>
            <span><strong>{nombre}</strong><span className={pendiente ? "compras-en-desarrollo" : ""}>{pendiente ? "Pendiente de implementación" : descripcion}</span></span>
            <span className="compras-flecha" aria-hidden="true">→</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
