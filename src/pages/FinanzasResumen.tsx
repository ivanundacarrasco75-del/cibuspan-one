import { PANTALLA_CUENTAS_POR_PAGAR, PANTALLA_PAGOS_SEMANALES, PANTALLA_RETENCIONES, PANTALLA_REPORTES_FINANZAS, PANTALLA_PRESTAMOS, PANTALLA_IMPUESTOS } from "../utils/permisosAplicacion"
import { MenuTarjetas, type Tarjeta } from "./ComprasResumen"

const documento = "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"
const calendario = "M5 4h14v16H5zM8 2v4m8-4v4M5 9h14m-9 5 2 2 4-4"
const grafico = "M4 4v16h16M8 16v-4m4 4V8m4 8V5"
const secciones: Tarjeta[] = [
  { nombre: "Cuentas por pagar", ruta: PANTALLA_CUENTAS_POR_PAGAR, descripcion: "Reúne los documentos de Compras y selecciona los pagos.", icono: documento },
  { nombre: "Pagos semanales", ruta: PANTALLA_PAGOS_SEMANALES, descripcion: "Consulta y registra los pagos programados para cada semana.", icono: calendario },
  { nombre: "Reportes", ruta: PANTALLA_REPORTES_FINANZAS, descripcion: "Consulta, imprime y descarga pagos realizados y recepciones de MP por fechas.", icono: grafico },
  { nombre: "Impuestos", ruta: PANTALLA_IMPUESTOS, descripcion: "Ingresa renta e IVA mensuales y selecciona los valores para Cuentas por pagar.", icono: documento },
  { nombre: "Préstamos", ruta: PANTALLA_PRESTAMOS, descripcion: "Registra cuotas, envíalas a Cuentas por pagar y consulta el saldo del préstamo.", icono: documento },
  { nombre: "Reglas de retenciones", ruta: PANTALLA_RETENCIONES, descripcion: "Calcula renta e IVA y registra el descuento de cada documento.", icono: documento },
  { nombre: "Roles de pago", ruta: "Pagos y Finanzas · Roles de pago", descripcion: "Carga y consulta los roles mensuales.", icono: documento },
  { nombre: "Importación contable", ruta: "Pagos y Finanzas · Importación contable", descripcion: "Carga los documentos y controla el cierre mensual.", icono: calendario },
  { nombre: "Clasificación de gastos", ruta: "Pagos y Finanzas · Clasificación de gastos", descripcion: "Revisa y clasifica los gastos contables.", icono: documento },
  { nombre: "Resultados", ruta: "Pagos y Finanzas · Resultados", descripcion: "Consulta el resultado contable.", icono: grafico },
  { nombre: "Rentabilidad", ruta: "Pagos y Finanzas · Rentabilidad", descripcion: "Analiza la rentabilidad comercial.", icono: grafico },
  { nombre: "Análisis", ruta: "Pagos y Finanzas · Análisis", descripcion: "Abre los reportes financieros.", icono: grafico },
  { nombre: "Facturas y pagos anteriores", ruta: "Pagos y Finanzas · Historial", descripcion: "Abre el registro anterior de facturas, pagos e importaciones de Excel.", icono: documento },
  ...["Cuentas por Cobrar", "Cobros y Conciliación", "Tesorería"].map(nombre => ({
    nombre, ruta: `Pagos y Finanzas · ${nombre}`, pendiente: true, icono: documento,
  })),
]

export default function FinanzasResumen({ puedeAcceder, cambiarPantalla }: {
  puedeAcceder: (pantalla: string) => boolean
  cambiarPantalla: (pantalla: string) => void
}) {
  return <MenuTarjetas titulo="Pagos y Finanzas" tarjetas={secciones.filter(tarjeta => puedeAcceder(tarjeta.ruta))}
    cambiarPantalla={cambiarPantalla} />
}
