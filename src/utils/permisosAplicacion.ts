import { ALIASES_PERMISOS, ARBOL_PERMISOS, rutasDeNodo, RUTAS_SOLO_ADMIN } from "../../supabase/functions/_shared/catalogoPermisos.ts"

export const PANTALLA_MENU_COMPRAS = "Compras · Resumen"
export const PANTALLA_ANTICIPAR_COMPRAS = "Compras · Compras por anticipar"
export const PANTALLA_FACTURAS_COMPRAS = "Compras · Facturas de compras"
export const PANTALLA_FACTURAS_SRI = "Compras · Facturas del SRI"
export const PANTALLA_ANTICIPOS = "Compras · Anticipos"
export const PANTALLA_RETENCIONES = "Pagos y Finanzas · Reglas de retenciones"
export const PANTALLA_REPORTES_FINANZAS = "Pagos y Finanzas · Reportes"
export const PANTALLA_IMPUESTOS = "Pagos y Finanzas · Impuestos"
export const PANTALLA_CXC = "Pagos y Finanzas · Cuentas por Cobrar"
export const PANTALLA_COBROS = "Pagos y Finanzas · Cobros y Conciliación"
export const PANTALLA_PRESTAMOS = "Pagos y Finanzas · Préstamos"
export const PANTALLA_NOTAS_VENTA = "Compras · Notas de venta"
export const PANTALLA_NO_DEDUCIBLES = "Compras · Gastos no deducibles"
export const PANTALLA_MENU_FINANZAS = "Pagos y Finanzas · Resumen"
export const PANTALLA_MENU_PRODUCCION = "Producción · Resumen"
export const PANTALLA_MENU_COMERCIAL = "Comercial · Menú"
export const PANTALLAS_MENU_COMERCIAL = ["Pedidos", "Ventas", "Devoluciones", "Descuentos", "Visitas y rotación", "Visitas diarias", "Revisión de datos", "KPI KAM"].map(nombre => `Comercial · ${nombre}`)
export const PANTALLA_CUENTAS_POR_PAGAR = "Pagos y Finanzas · Cuentas por Pagar"
export const PANTALLA_PAGOS_SEMANALES = "Pagos y Finanzas · Pagos semanales"
export const PANTALLA_PAGOS_ANTERIOR = "Pagos y Finanzas · Pagos"

export const PANTALLAS_DOCUMENTOS_COMPRAS = [PANTALLA_FACTURAS_SRI, PANTALLA_NOTAS_VENTA, PANTALLA_NO_DEDUCIBLES, PANTALLA_ANTICIPOS]

const grupos: Array<[string, string[]]> = [
  ["Dashboard", ["Dashboard · SKU", "Dashboard · Comercial", "Dashboard · Costos y gastos", "Dashboard · Devoluciones", "Dashboard · Rentabilidad", "Comercial · Análisis"]],
  ["Pedidos", ["Comercial · Pedidos", "Producción · Pedidos"]],
  ["Casa Masa", ["Casa Masa · Pedidos y empaque"]],
  ["Inventario", ["Inventario y Despachos · Resumen", "Inventario y Despachos · Inventario", "Inventario y Despachos · Kardex"]],
  ["Producción", ["Producción · Resumen", "Producción · Planificación", "Producción · Producción", "Producción · Historial"]],
  ["Preformulación", ["Producción · Fórmulas"]],
  ["Semielaborados", ["Producción · Semielaborados", "Producción · Etiquetado"]],
  ["Despachos", ["Inventario y Despachos · Preparación", "Inventario y Despachos · Despachos"]],
  ["Historial despachos", ["Inventario y Despachos · Historial"]],
  ["Documentos", ["Inventario y Despachos · Documentos"]],
  ["Devoluciones", ["Comercial · Devoluciones", "Reporte de devoluciones"]],
  ["Descuentos", ["Comercial · Descuentos", "Descuentos y promociones"]],
  ["Campo comercial", ["Dashboard · Visitas y rotación", "Comercial · Visitas y rotación", "Supervisión KAM", "Comercial · Visitas diarias", "Visitas diarias", "Comercial · Revisión de datos"]],
  ["KPI KAM", ["Comercial · KPI KAM"]],
  ["Materias primas", ["Compras · Materias Primas y Empaques", "Compras · Kardex"]],
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

export function puedeAbrirPantalla(
  pantalla: string, rol: string, permitidas: readonly string[], denegadas: readonly string[] = [],
): boolean {
  const ruta = ALIASES_PERMISOS[pantalla] ?? pantalla
  if (ruta === PANTALLA_MENU_COMERCIAL) return !denegadas.includes(ruta) && PANTALLAS_MENU_COMERCIAL.some(hijo => puedeAbrirPantalla(hijo, rol, permitidas, denegadas))
  if (ruta === "Administración · Usuarios y Permisos") return rol === "ADMINISTRADOR"
  if (RUTAS_SOLO_ADMIN.includes(ruta) && rol !== "ADMINISTRADOR") return false
  const menus: Record<string, string[]> = {
    [PANTALLA_MENU_PRODUCCION]: rutasDeNodo(ARBOL_PERMISOS[2]).filter((item) => item !== PANTALLA_MENU_PRODUCCION),
    [PANTALLA_MENU_COMPRAS]: rutasDeNodo(ARBOL_PERMISOS[4]).filter((item) => item !== PANTALLA_MENU_COMPRAS),
    [PANTALLA_FACTURAS_COMPRAS]: PANTALLAS_DOCUMENTOS_COMPRAS,
    [PANTALLA_MENU_FINANZAS]: rutasDeNodo(ARBOL_PERMISOS[5]).filter((item) => item !== PANTALLA_MENU_FINANZAS),
  }
  if ([PANTALLA_MENU_COMPRAS, PANTALLA_FACTURAS_COMPRAS].includes(ruta) &&
    permitidas.includes(PANTALLA_CUENTAS_POR_PAGAR) && !denegadas.includes(PANTALLA_CUENTAS_POR_PAGAR)) return true
  if (ruta === PANTALLA_MENU_PRODUCCION && menus[ruta].some((hijo) =>
    puedeAbrirPantalla(hijo, rol, permitidas, denegadas))) return true
  if (menus[ruta]?.some((hijo) => permitidas.includes(hijo) && !denegadas.includes(hijo) &&
    (!RUTAS_SOLO_ADMIN.includes(hijo) || rol === "ADMINISTRADOR"))) return true
  if (denegadas.includes(ruta)) return false
  if (permisoDePantalla(pantalla) === "Casa Masa") return (permitidas.includes(ruta) || permitidas.includes("Casa Masa")) && permitidas.some(p => p === "Pedidos" || p === "Despachos")
  if (permitidas.includes(ruta)) return true
  if (pantalla === PANTALLA_MENU_FINANZAS) {
    return rol === "ADMINISTRADOR" || permitidas.includes("Administración") || permitidas.includes("Reportes")
  }
  if (pantalla === PANTALLA_PAGOS_SEMANALES) return rol === "ADMINISTRADOR"
  if ([PANTALLA_CUENTAS_POR_PAGAR, PANTALLA_PAGOS_ANTERIOR, PANTALLA_REPORTES_FINANZAS, PANTALLA_PRESTAMOS, PANTALLA_IMPUESTOS, PANTALLA_CXC, PANTALLA_COBROS].includes(pantalla) && rol === "ADMINISTRADOR") return true
  if (pantalla === PANTALLA_MENU_COMPRAS) {
    return permitidas.includes("Administración") || permitidas.includes("Materias primas") || rol === "ADMINISTRADOR"
  }
  if (pantalla === PANTALLA_ANTICIPAR_COMPRAS) {
    return permitidas.includes("Administración") && permitidas.includes("Materias primas")
  }
  if (pantalla === PANTALLA_FACTURAS_COMPRAS) {
    return rol === "ADMINISTRADOR" || permitidas.includes("Administración")
  }
  if (pantalla === PANTALLA_FACTURAS_SRI) return rol === "ADMINISTRADOR"
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
