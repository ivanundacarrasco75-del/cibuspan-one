import type { LecturaFavorita } from "../repositories/campoComercialRepository"
import { identidadDobleLecturaCampo } from "./validacionLecturasCampo"
export type TextoImagenCampo = { principal: string; control: string; confianza: number; confianza_control: number }
const fecha = (v: LecturaFavorita) => v.fecha_fuente ?? null
const esDetalle = (texto: string) => (texto.toUpperCase().match(/PRECIO\s+AFILIADO|VENTA\s+PROMED|EXISTENCIA\s+EN\s+LOCAL|INVENTARIO\s+CD|CANTIDAD\s+DEL\s+DESPACHO/g)?.length ?? 0) >= 2

// Una cabecera de otro SKU corta la asociación. Una continuación sólo se acepta
// después de una cabecera comprobada del SKU y con fecha/hora compatible.
export function seleccionarCapturasSkuCampo(imagenes: TextoImagenCampo[], codigoEsperado: string | undefined,
  interpretar: (texto: string, confianza?: number) => LecturaFavorita) {
  const codigo = codigoEsperado?.replace(/T$/i, "")
  const incluidas: number[] = [], omitidas: Array<{ indice: number; motivo: string }> = []
  let contexto: { codigo: string; fecha: string | null } | null = null
  if (!codigo) return { incluidas: imagenes.map((_, i) => i), omitidas }
  for (const [i, imagen] of imagenes.entries()) {
    const a = interpretar(imagen.principal, imagen.confianza), b = interpretar(imagen.control, imagen.confianza_control)
    if (a.codigo_barras || b.codigo_barras) {
      contexto = identidadDobleLecturaCampo(a, b) ? { codigo: a.codigo_barras!, fecha: fecha(a) } : null
      if (contexto?.codigo === codigo && (!fecha(a) || !fecha(b) || fecha(a) === fecha(b))) incluidas.push(i)
      else omitidas.push({ indice: i, motivo: "Cabecera de otro SKU o identidad contradictoria." })
    } else if (contexto?.codigo === codigo && esDetalle(imagen.principal) && esDetalle(imagen.control)
      && (!fecha(a) || !contexto.fecha || fecha(a) === contexto.fecha) && (!fecha(b) || !contexto.fecha || fecha(b) === contexto.fecha)) incluidas.push(i)
    else omitidas.push({ indice: i, motivo: "Falta una cabecera comprobada para asociar esta imagen al SKU." })
  }
  return { incluidas, omitidas }
}

// Sólo para reanalizar diagnósticos antiguos que no guardaban un bloque por archivo.
// No se inventa la división si las dos pasadas no contienen las mismas cabeceras.
export function separarTextosDiagnosticoCampo(principal: string, control: string, confianza: number, confianzaControl: number): TextoImagenCampo[] {
  const separar = (texto: string) => texto.split(/(?=^.*\bDetalle del producto\b.*$)/im).filter((t) => /Detalle del producto/i.test(t))
  const a = separar(principal), b = separar(control)
  if (!a.length || a.length !== b.length) return [{ principal, control, confianza, confianza_control: confianzaControl }]
  return a.map((texto, i) => ({ principal: texto, control: b[i], confianza, confianza_control: confianzaControl }))
}
