import { MenuTarjetas, type Tarjeta } from "./ComprasResumen"

const documento = "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"
const secciones: Tarjeta[] = [
  { nombre: "Pedidos", ruta: "Producción · Pedidos", descripcion: "Consulta los pedidos que alimentan la producción.", icono: documento },
  { nombre: "Planificación", ruta: "Producción · Planificación", descripcion: "Revisa las necesidades y los lotes sugeridos por período.", icono: "M5 4h14v16H5zM8 2v4m8-4v4M5 9h14m-9 5 2 2 4-4" },
  { nombre: "Producción", ruta: "Producción · Producción", descripcion: "Ajusta los lotes y registra la producción realizada.", icono: "M3 21V9l6 3V6l6 3V3h6v18H3Zm4-4h2m3 0h2m3 0h2" },
  { nombre: "Fórmulas", ruta: "Producción · Fórmulas", descripcion: "Consulta y gestiona las fórmulas y sus versiones.", icono: "M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8" },
  { nombre: "Semielaborados", ruta: "Producción · Semielaborados", pendiente: true, icono: "m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10" },
  { nombre: "Etiquetado", ruta: "Producción · Etiquetado", descripcion: "Prepara las etiquetas de semielaborados.", icono: "M3 3h8l10 10-8 8L3 11V3Zm5 5h.01" },
  { nombre: "Historial", ruta: "Producción · Historial", descripcion: "Consulta las órdenes registradas y las OP históricas.", icono: "M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l4 2" },
  { nombre: "Análisis", ruta: "Producción · Análisis", descripcion: "Abre los reportes y análisis de producción.", icono: "M4 4v16h16M8 16v-4m4 4V8m4 8V5" },
  { nombre: "Hoja de producción", ruta: "Hoja de producción", descripcion: "Consulta el documento de trabajo de producción.", icono: documento },
]

export default function ProduccionResumen({ puedeAcceder, cambiarPantalla }: {
  puedeAcceder: (pantalla: string) => boolean
  cambiarPantalla: (pantalla: string) => void
}) {
  return <MenuTarjetas titulo="Producción" tarjetas={secciones.filter(tarjeta => puedeAcceder(tarjeta.ruta))}
    cambiarPantalla={cambiarPantalla} />
}
