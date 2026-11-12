import { clienteIngresoManualCampo } from "../utils/validacionLecturasCampo"
import { supabase } from "../lib/supabase"
import { leerCarasPercha } from "../utils/supervisionCampo"
import type { ProductoDashboardCampo, RegistroDashboardCampo } from "../utils/dashboardVisitasRotacion"
import type { GeorreferenciaCampo, FotoCampo } from "../utils/georreferenciaCampo"
import { CAMPOS_CANTIDADES_CAMPO } from "../utils/lecturaCapturasCampo"
import type { LecturaFavorita } from "./campoComercialRepository"

export type DatosDashboardCampo = {
  clientes: Array<{ id: string; nombre: string }>
  locales: Array<{ id: string; codigo: string; nombre: string }>
  productos: ProductoDashboardCampo[]
  registros: RegistroDashboardCampo[]
}
const numero = (valor: unknown): number | null => valor == null || valor === "" || !Number.isFinite(Number(valor)) ? null : Number(valor)

export async function obtenerDashboardVisitasRotacion(
  clienteId: string, desde: string, hasta: string, { soloAsignados = false } = {},
): Promise<DatosDashboardCampo> {
  const [catalogo, registros] = await Promise.all([
    supabase.rpc("com_kpi_campo_catalogo", { p_cliente_id: clienteId || null, p_desde: desde, p_hasta: hasta }),
    leerRegistros(clienteId, desde, hasta),
  ])
  if (catalogo.error) throw new Error(`No se pudo cargar el catálogo de visitas: ${catalogo.error.message}`)
  const datos = catalogo.data ?? {}
  const clientes: DatosDashboardCampo["clientes"] = datos.clientes ?? []
  const productos: Array<ProductoDashboardCampo & { autorizado?: boolean }> = datos.productos ?? []
  const asignaciones = soloAsignados
    ? clienteId
      ? new Map([[clienteId, new Set(productos.filter((p) => p.autorizado === true).map((p) => p.id))]])
      : await leerAsignacionesActivas(clientes.map((c) => c.id))
    : null
  const asignados = asignaciones ? new Set([...asignaciones.values()].flatMap((ids) => [...ids])) : null
  const productosVisibles = asignados ? productos.filter((p) => asignados.has(p.id)) : productos
  const idsVisibles = new Set(productosVisibles.map((p) => p.id))
  const registrosVisibles = asignaciones
    ? registros.filter((r) => idsVisibles.has(r.producto_id) && asignaciones.get(r.cliente_id)?.has(r.producto_id))
    : registros
  const administrador = datos.puede_administrar === true
  const usuarioId = administrador ? null : (await supabase.auth.getUser()).data.user?.id
  return { clientes, locales: datos.locales ?? [], productos: productosVisibles,
    registros: registrosVisibles.map((r) => {
      const nombre = clientes.find((c) => c.id === r.cliente_id)?.nombre ?? ""
      return { ...r, cliente_nombre: nombre, lector_estado: clienteIngresoManualCampo(nombre) ? "RESPALDO_MANUAL" : r.lector_estado, puede_procesar: administrador || !!usuarioId && r.registrado_por === usuarioId }
    }) }
}

async function leerAsignacionesActivas(clientes: string[]) {
  const asignaciones = new Map<string, Set<string>>()
  if (!clientes.length) return asignaciones
  const pagina = 500
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabase.from("cliente_productos")
      .select("cliente_id, producto_id").eq("activo", true).in("cliente_id", clientes)
      .order("cliente_id").order("producto_id").range(inicio, inicio + pagina - 1)
    if (error) throw new Error(`No se pudieron cargar las asignaciones de Cliente - Producto: ${error.message}`)
    for (const fila of data ?? []) {
      const productos = asignaciones.get(fila.cliente_id) ?? new Set<string>()
      productos.add(fila.producto_id)
      asignaciones.set(fila.cliente_id, productos)
    }
    if ((data?.length ?? 0) < pagina) return asignaciones
  }
}

async function leerRegistros(clienteId: string, desde: string, hasta: string) {
  const registros: RegistroDashboardCampo[] = []
  for (let inicio = 0; ; inicio += 500) {
    let consulta = supabase.from("com_visitas_campo_sku").select(`
      id, actualizado_en, datos_ia, capturas_app, confianza_ia, codificado_app, presencia_percha,
      rotacion_diaria_unidades, stock_local_unidades, dias_inventario_local,
      precio_comercio, precio_afiliado, venta_diaria_valor, prediccion_venta_unidades,
      stock_cd_cajas, dias_inventario_cd, participacion_clase, participacion_subclase,
      unidades_por_caja, cantidad_ultimo_pedido, cantidad_ultimo_despacho, fecha_ultimo_pedido, fecha_ultimo_despacho,
      producto:productos(nombre, codigo),
      producto_id,
      visita:com_visitas_campo!inner(id, fecha_visita, visitado_en, cliente_id, registrado_por,
        local_monitoreado_id, estado, local:com_locales_monitoreados(nombre))
    `).eq("visita.estado", "CONFIRMADA")
      .gte("visita.fecha_visita", desde).lte("visita.fecha_visita", hasta)
      .order("id").range(inicio, inicio + 499)
    if (clienteId) consulta = consulta.eq("visita.cliente_id", clienteId)
    const { data, error } = await consulta
    if (error) throw new Error(`No se pudo cargar el histórico de visitas: ${error.message}`)
    for (const fila of data ?? []) {
      const visita = fila.visita as unknown as { id: string; fecha_visita: string; visitado_en: string; cliente_id: string; registrado_por: string; local_monitoreado_id: string; local: { nombre: string } | null }
      const producto = fila.producto as unknown as { nombre: string; codigo: string } | null
      const datos = (fila.datos_ia ?? {}) as Record<string, unknown>
      const stock = numero(fila.stock_local_unidades)
      const caras = leerCarasPercha(datos)
      registros.push({
        id: fila.id, fecha: visita.fecha_visita, visitado_en: visita.visitado_en,
        actualizado_en: fila.actualizado_en, cliente_id: visita.cliente_id,
        registrado_por: visita.registrado_por,
        visita_id: visita.id,
        responsable_nombre: datos.responsable_id === visita.registrado_por && typeof datos.responsable_nombre === "string" ? datos.responsable_nombre : null,
        local_id: visita.local_monitoreado_id, local_nombre: visita.local?.nombre ?? "Local",
        producto_id: fila.producto_id, producto_codigo: producto?.codigo ?? "", producto_nombre: producto?.nombre ?? "SKU",
        responsable_rol: datos.responsable_id === visita.registrado_por && typeof datos.responsable_rol === "string" ? datos.responsable_rol : null,
        georreferencia: (datos.georreferencia_visita ?? null) as GeorreferenciaCampo | null,
        fotos_georreferencia: Array.isArray(datos.fotos_georreferencia) ? datos.fotos_georreferencia as FotoCampo[] : [],
        capturas_app: Array.isArray(fila.capturas_app) ? fila.capturas_app : [],
        verificacion_campos: (datos.verificacion_campos ?? {}) as NonNullable<RegistroDashboardCampo["verificacion_campos"]>,
        version_validacion: typeof datos.version_validacion === "string" ? datos.version_validacion : undefined,
        lector_estado: typeof datos.lector_estado === "string" ? datos.lector_estado : null,
        lectura_almacenada: { ...datos, confianza: numero(fila.confianza_ia) ?? numero(datos.confianza) ?? 0 } as LecturaFavorita,
        lectura_guardada: { ...Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([campo]) => [campo, numero(fila[campo])])), fecha_ultimo_pedido: fila.fecha_ultimo_pedido ?? null, fecha_ultimo_despacho: fila.fecha_ultimo_despacho ?? null } as Partial<LecturaFavorita>,
        valores: {
          rotacion: numero(fila.rotacion_diaria_unidades), stock, dias: numero(fila.dias_inventario_local), caras,
          precio: numero(fila.precio_comercio), precio_afiliado: numero(fila.precio_afiliado), venta: numero(fila.venta_diaria_valor),
          participacion_clase: numero(fila.participacion_clase), participacion_subclase: numero(fila.participacion_subclase),
          prediccion: numero(fila.prediccion_venta_unidades), stock_cd: numero(fila.stock_cd_cajas), dias_cd: numero(fila.dias_inventario_cd),
          presencia: fila.presencia_percha === "PRESENTE" ? 100 : fila.presencia_percha === "AUSENTE" ? 0 : null,
          codificacion: fila.codificado_app == null ? null : fila.codificado_app ? 100 : 0,
          quiebres: stock === null ? null : stock === 0 ? 100 : 0,
          sin_perchar: stock === null || caras === null ? null : stock > 0 && caras === 0 ? 100 : 0,
        },
      })
    }
    if ((data?.length ?? 0) < 500) return registros
  }
}
