export type PuntoCampo = { latitud: number; longitud: number }
export type PosicionCampo = PuntoCampo & { precision: number; registrado_en?: string }
export type LocalCampo = {
  id: string; codigo: string; nombre: string
  direccion?: string | null; latitud?: number | null; longitud?: number | null
  radio_metros?: number; referencia_actualizada_en?: string | null
  propuesta?: { visita_id: string; nombre_captura: string; visitado_en: string; latitud: number; longitud: number;
    precision: number; responsable: string; capturas: string[] } | null
}
export type EstadoUbicacionCampo = "COMPATIBLE" | "FUERA" | "IMPRECISA" | "REVISAR" | "SIN_REFERENCIA" | "SIN_UBICACION"
export type GeorreferenciaCampo = {
  local_id: string; local_nombre: string; direccion: string | null
  referencia: (PuntoCampo & { radio_metros: number; actualizado_en: string | null }) | null
  ubicacion: PosicionCampo | null
  estado: EstadoUbicacionCampo; distancia_metros: number | null
  nombre_local_captura?: string | null; local_captura_coincide?: boolean
}
export type FotoCampo = {
  ruta: string; origen: "CAMARA" | "GALERIA" | "DESCONOCIDO"
  adjuntada_en: string | null; georreferencia: GeorreferenciaCampo
}
export type FotoBorradorCampo = Omit<FotoCampo, "ruta"> & { archivo: string }

export function puntoValido(p: unknown): p is PuntoCampo {
  if (!p || typeof p !== "object") return false
  const { latitud, longitud } = p as PuntoCampo
  return typeof latitud === "number" && Number.isFinite(latitud) && Math.abs(latitud) <= 90 &&
    typeof longitud === "number" && Number.isFinite(longitud) && Math.abs(longitud) <= 180
}

export function distanciaMetros(a: PuntoCampo, b: PuntoCampo) {
  const rad = (v: number) => v * Math.PI / 180
  const h = Math.sin(rad(b.latitud - a.latitud) / 2) ** 2 +
    Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(rad(b.longitud - a.longitud) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function georreferenciarLocal(local: LocalCampo, posicion: PosicionCampo | null): GeorreferenciaCampo {
  const referencia = puntoValido(local) ? { latitud: local.latitud!, longitud: local.longitud!,
    radio_metros: local.radio_metros ?? 150, actualizado_en: local.referencia_actualizada_en ?? null } : null
  const ubicacion = puntoValido(posicion) && typeof posicion.precision === "number" &&
    Number.isFinite(posicion.precision) && posicion.precision >= 0 ? { ...posicion } : null
  const distancia = ubicacion && referencia ? distanciaMetros(ubicacion, referencia) : null
  let estado: EstadoUbicacionCampo = "SIN_UBICACION"
  if (ubicacion) {
    if (!referencia) estado = "SIN_REFERENCIA"
    else if (ubicacion.precision > 100) estado = "IMPRECISA"
    else if (distancia! + ubicacion.precision <= referencia.radio_metros) estado = "COMPATIBLE"
    else if (distancia! - ubicacion.precision > referencia.radio_metros) estado = "FUERA"
    else estado = "REVISAR"
  }
  return { local_id: local.id, local_nombre: local.nombre, direccion: local.direccion ?? null,
    referencia, ubicacion, estado, distancia_metros: distancia === null ? null : Math.round(distancia) }
}

export function textoUbicacion(g?: GeorreferenciaCampo | null) {
  if (!g) return "Sin georreferencia registrada"
  const etiquetas: Record<EstadoUbicacionCampo, string> = {
    COMPATIBLE: "Ubicación compatible con el local", FUERA: "Ubicación fuera del local",
    IMPRECISA: "GPS impreciso: no se puede confirmar el local", REVISAR: "Cerca del límite: revisar ubicación",
    SIN_REFERENCIA: "Local sin coordenadas de referencia", SIN_UBICACION: "Sin ubicación del celular",
  }
  return `${etiquetas[g.estado] ?? "Revisar ubicación"}${g.distancia_metros === null ? "" : ` · ${g.distancia_metros} m del punto del local`}`
}

export function enlaceMapa(p: PuntoCampo) {
  return puntoValido(p) ? `https://www.openstreetmap.org/?mlat=${p.latitud}&mlon=${p.longitud}#map=18/${p.latitud}/${p.longitud}` : ""
}

export function claveFoto(archivo: { name: string; size: number; lastModified: number }) {
  return JSON.stringify([archivo.name, archivo.size, archivo.lastModified])
}

export function localDeCaptura(nombre: string | null, locales: LocalCampo[]) {
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const texto = normalizar(nombre ?? "")
  if (texto.length < 6) return null
  const candidatas = locales.filter((l) => {
    const n = normalizar(l.nombre)
    return n.length >= 6 && (n.includes(texto) || texto.includes(n))
  })
  return candidatas.length === 1 ? candidatas[0] : null
}

// No se reutiliza el GPS del inicio para afirmar dónde se adjuntó otra foto.
export function asociarFotos(rutas: string[], archivos: Array<{ name: string; size: number; lastModified: number }>,
  borradores: FotoBorradorCampo[], local: LocalCampo): FotoCampo[] {
  return rutas.map((ruta, i) => {
    const dato = archivos[i] && borradores.find((b) => b.archivo === claveFoto(archivos[i]) && b.georreferencia.local_id === local.id)
    return { ruta, origen: dato?.origen ?? "DESCONOCIDO", adjuntada_en: dato?.adjuntada_en ?? null,
      georreferencia: dato?.georreferencia ?? georreferenciarLocal(local, null) }
  })
}

export function obtenerPosicionCampo(): Promise<PosicionCampo> {
  if (!navigator.geolocation) return Promise.reject(new Error("Este dispositivo no permite obtener ubicación."))
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    (p) => resolve({ latitud: p.coords.latitude, longitud: p.coords.longitude, precision: p.coords.accuracy,
      registrado_en: new Date(p.timestamp).toISOString() }),
    () => reject(new Error("No se pudo obtener el GPS. Revisa el permiso de ubicación del celular.")),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
  ))
}
