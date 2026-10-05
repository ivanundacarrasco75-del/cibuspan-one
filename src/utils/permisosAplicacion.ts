const grupos: Array<[string, string[]]> = [
  ["Dashboard", ["Dashboard · Devoluciones", "Dashboard · Rentabilidad", "Comercial · Análisis"]],
  ["Pedidos", ["Comercial · Pedidos", "Producción · Pedidos"]],
  ["Inventario", ["Inventario y Despachos · Resumen", "Inventario y Despachos · Inventario"]],
  ["Producción", ["Producción · Resumen", "Producción · Planificación", "Producción · Producción", "Producción · Historial"]],
  ["Preformulación", ["Producción · Fórmulas"]],
  ["Semielaborados", ["Producción · Semielaborados", "Producción · Etiquetado"]],
  ["Despachos", ["Inventario y Despachos · Preparación", "Inventario y Despachos · Despachos"]],
  ["Historial despachos", ["Inventario y Despachos · Historial"]],
  ["Documentos", ["Inventario y Despachos · Documentos"]],
  ["Devoluciones", ["Comercial · Devoluciones", "Reporte de devoluciones"]],
  ["Descuentos", ["Comercial · Descuentos", "Descuentos y promociones"]],
  ["Campo comercial", ["Comercial · Visitas y rotación", "Supervisión KAM"]],
  ["KPI KAM", ["Comercial · KPI KAM"]],
  ["Materias primas", ["Compras · Materias Primas y Empaques"]],
  ["Reportes", ["Producción · Análisis", "Inventario y Despachos · Análisis", "Pagos y Finanzas · Análisis", "Pagos y Finanzas · Resultados", "Pagos y Finanzas · Rentabilidad", "Costos indirectos", "Rentabilidad por SKU", "Simulador", "Comercial · Ventas", "Ventas", "Ventas por cliente y SKU"]],
  ["Usuarios y permisos", ["Administración · Usuarios y Permisos"]],
  ["Administración", ["Comercial · Clientes", "Comercial · SKU", "Pagos y gastos", "Roles de pago"]],
]

const permisosPorRuta = new Map(grupos.flatMap(([permiso, rutas]) => rutas.map((ruta) => [ruta, permiso] as const)))

export function permisoDePantalla(pantalla: string): string {
  const permiso = permisosPorRuta.get(pantalla)
  if (permiso) return permiso
  if (["Administración ·", "Compras ·", "Pagos y Finanzas ·"].some((prefijo) => pantalla.startsWith(prefijo))) return "Administración"
  return pantalla
}

export function puedeAbrirPantalla(pantalla: string, rol: string, permitidas: readonly string[]): boolean {
  const permiso = permisoDePantalla(pantalla)
  if (permiso === "Usuarios y permisos") return rol === "ADMINISTRADOR"
  return permitidas.includes(permiso)
}

export function filtrarModulosPermitidos<T extends { entrada: string; items: Array<{ pantalla: string }> }>(
  modulos: T[], puede: (pantalla: string) => boolean,
): T[] {
  return modulos.flatMap((modulo) => {
    const items = modulo.items.filter((item) => puede(item.pantalla))
    const entrada = puede(modulo.entrada) ? modulo.entrada : items[0]?.pantalla
    return entrada ? [{ ...modulo, entrada, items }] : []
  })
}

export function permisosCoinciden(
  esperados: Array<{ pantalla: string; permitido: boolean }>,
  guardados: Array<{ pantalla: string; permitido: boolean }>,
): boolean {
  const porPantalla = new Map(guardados.map((item) => [item.pantalla, item.permitido]))
  return esperados.length === guardados.length && porPantalla.size === guardados.length &&
    new Set(esperados.map((item) => item.pantalla)).size === esperados.length &&
    esperados.every((item) => porPantalla.get(item.pantalla) === item.permitido)
}
