export type NodoPermiso = {
  etiqueta: string
  ruta?: string
  hijos?: NodoPermiso[]
}

const opcion = (ruta: string, etiqueta = ruta.split(" · ").at(-1)!): NodoPermiso => ({ ruta, etiqueta })

export const ARBOL_PERMISOS: NodoPermiso[] = [
  { etiqueta: "Dashboards", hijos: [
    opcion("Dashboard", "Revisión operativa"),
    opcion("Dashboard · Comercial"), opcion("Dashboard · Visitas y rotación", "Visitas PDV"),
    opcion("Dashboard · Costos y gastos"),
    { etiqueta: "Detalles", hijos: [opcion("Dashboard · Devoluciones"), opcion("Dashboard · Rentabilidad")] },
  ] },
  { etiqueta: "Comercial", hijos: [
    ...["Pedidos", "Ventas", "Devoluciones", "Descuentos", "Clientes", "SKU"].map((item) => opcion(`Comercial · ${item}`)),
    opcion("Comercial · Visitas y rotación", "Registro de visitas"),
    opcion("Comercial · Visitas diarias"), opcion("Comercial · Revisión de datos"),
    opcion("Comercial · KPI KAM", "Gestión Comercial"), opcion("Comercial · Análisis"),
    opcion("Supervisión KAM"), opcion("Reporte de devoluciones"),
  ] },
  { etiqueta: "Producción", hijos: [
    ...["Resumen", "Pedidos", "Planificación", "Producción", "Fórmulas", "Semielaborados", "Etiquetado", "Historial", "Análisis"]
      .map((item) => opcion(`Producción · ${item}`)),
    opcion("Hoja de producción"),
  ] },
  { etiqueta: "Inventario y Despachos", hijos: [
    ...["Resumen", "Inventario", "Kardex", "Preparación", "Despachos", "Documentos", "Historial", "Análisis"]
      .map((item) => opcion(`Inventario y Despachos · ${item}`)),
    opcion("Hoja de despacho"), opcion("Anexo Supermaxi"),
  ] },
  { etiqueta: "Compras", hijos: [
    opcion("Compras · Resumen", "Inicio de Compras"), opcion("Compras · Compras por anticipar"),
    { etiqueta: "Facturas de compras", ruta: "Compras · Facturas de compras", hijos: [
      opcion("Compras · Facturas del SRI", "Facturas SRI"), opcion("Compras · Notas de venta"),
      opcion("Compras · Gastos no deducibles"),
    ] },
    ...["Materias Primas y Empaques", "Proveedores", "Costos", "Kardex", "Historial", "Análisis"]
      .map((item) => opcion(`Compras · ${item}`)),
  ] },
  { etiqueta: "Pagos y Finanzas", hijos: [
    ...["Resumen", "Cuentas por Pagar", "Pagos semanales", "Roles de pago", "Importación contable",
      "Clasificación de gastos", "Resultados", "Rentabilidad", "Análisis", "Historial",
      "Cuentas por Cobrar", "Cobros y Conciliación", "Tesorería"]
      .map((item) => opcion(`Pagos y Finanzas · ${item}`)),
    opcion("Costos indirectos"), opcion("Rentabilidad por SKU"), opcion("Simulador"),
  ] },
  { etiqueta: "Administración", hijos: [
    ...["Resumen", "Usuarios y Permisos", "Maestros", "Configuración", "Importaciones", "Auditoría", "Sistema"]
      .map((item) => opcion(`Administración · ${item}`)),
  ] },
]

export function rutasDeNodo(nodo: NodoPermiso): string[] {
  return [...(nodo.ruta ? [nodo.ruta] : []), ...(nodo.hijos ?? []).flatMap(rutasDeNodo)]
}

export const RUTAS_PERMISOS = ARBOL_PERMISOS.flatMap(rutasDeNodo)

export const ALIASES_PERMISOS: Record<string, string> = {
  "Pagos y Finanzas · Impuestos": "Pagos y Finanzas · Cuentas por Pagar",
  "Pagos y Finanzas · Préstamos": "Pagos y Finanzas · Cuentas por Pagar",
  "Pagos y Finanzas · Reportes": "Pagos y Finanzas · Cuentas por Pagar",
  "Compras · Anticipos": "Pagos y Finanzas · Cuentas por Pagar",
  "Pagos y Finanzas · Reglas de retenciones": "Pagos y Finanzas · Cuentas por Pagar",
  "Dashboard · SKU": "Dashboard · Comercial",
  Pedidos: "Comercial · Pedidos",
  Ventas: "Comercial · Ventas",
  "Ventas por cliente y SKU": "Comercial · Ventas",
  Devoluciones: "Comercial · Devoluciones",
  Descuentos: "Comercial · Descuentos",
  "Descuentos y promociones": "Comercial · Descuentos",
  "KPI KAM": "Comercial · KPI KAM",
  "Campo comercial": "Comercial · Visitas y rotación",
  "Visitas diarias": "Comercial · Visitas diarias",
  Producción: "Producción · Producción",
  Preformulación: "Producción · Fórmulas",
  Semielaborados: "Producción · Etiquetado",
  Inventario: "Inventario y Despachos · Inventario",
  Despachos: "Inventario y Despachos · Despachos",
  "Historial despachos": "Inventario y Despachos · Historial",
  Documentos: "Inventario y Despachos · Documentos",
  "Materias primas": "Compras · Materias Primas y Empaques",
  "Compras · Facturas": "Compras · Facturas de compras",
  "Pagos y Finanzas · Pagos": "Pagos y Finanzas · Cuentas por Pagar",
  "Pagos y gastos": "Pagos y Finanzas · Historial",
  "Roles de pago": "Pagos y Finanzas · Roles de pago",
  Reportes: "Pagos y Finanzas · Análisis",
  Administración: "Administración · Resumen",
  "Usuarios y permisos": "Administración · Usuarios y Permisos",
}

export const RUTAS_SOLO_ADMIN = [
  "Administración · Usuarios y Permisos",
]
