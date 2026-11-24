import { MenuTarjetas, type Tarjeta } from "./ComprasResumen"

const documento = "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"
const secciones: Tarjeta[] = [
  { nombre: "Pedidos", ruta: "Comercial · Pedidos", descripcion: "Importa y registra los pedidos de tus clientes.", icono: documento },
  { nombre: "Ventas", ruta: "Comercial · Ventas", descripcion: "Carga y consulta las ventas por cliente y producto.", icono: "M4 4v16h16M8 16v-4m4 4V8m4 8V5" },
  { nombre: "Devoluciones", ruta: "Comercial · Devoluciones", descripcion: "Importa y revisa los productos devueltos.", icono: "M9 10H3m0 0 4-4m-4 4 4 4m-4-4h12a6 6 0 0 1 0 12" },
  { nombre: "Descuentos", ruta: "Comercial · Descuentos", descripcion: "Programa promociones y consulta su historial.", icono: "M3 3h8l10 10-8 8L3 11V3Zm5 5h.01M10 10l6 6m0-6-6 6" },
  { nombre: "Visitas y rotación", ruta: "Comercial · Visitas y rotación", descripcion: "Ingresa las visitas y mediciones de los puntos de venta.", icono: "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0" },
  { nombre: "Visitas diarias", ruta: "Comercial · Visitas diarias", descripcion: "Consulta el seguimiento diario de visitas a locales.", icono: "M5 4h14v16H5zM8 2v4m8-4v4M5 9h14m-9 5 2 2 4-4" },
  { nombre: "Revisión de datos", ruta: "Comercial · Revisión de datos", descripcion: "Comprueba las mediciones pendientes por indicador.", icono: "M9 3h6l1 3h3v15H5V6h3l1-3Zm0 10 2 2 4-4" },
  { nombre: "Gestión Comercial", ruta: "Comercial · KPI KAM", descripcion: "Revisa los indicadores y compromisos de las cuentas clave.", icono: "M3 4h18v12H3zM8 21l4-5 4 5M7 12l3-3 3 2 4-4" },
]

export default function ComercialMenu({ puedeAcceder, cambiarPantalla }: {
  puedeAcceder: (pantalla: string) => boolean
  cambiarPantalla: (pantalla: string) => void
}) {
  return <MenuTarjetas titulo="Comercial" tarjetas={secciones.filter(tarjeta => puedeAcceder(tarjeta.ruta))}
    cambiarPantalla={cambiarPantalla} />
}
