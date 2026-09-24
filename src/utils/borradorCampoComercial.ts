const NOMBRE_BASE = "cibuspan-one-borradores"
const VERSION_BASE = 1
const ALMACEN_ARCHIVOS = "archivos-campo"

export type GrupoArchivosCampo = "capturas" | "percha"

type ArchivoGuardado = {
  contenido: Blob
  nombre: string
  tipo: string
  ultimaModificacion: number
}

function abrirBase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_BASE, VERSION_BASE)
    solicitud.onupgradeneeded = () => {
      const base = solicitud.result
      if (!base.objectStoreNames.contains(ALMACEN_ARCHIVOS)) {
        base.createObjectStore(ALMACEN_ARCHIVOS)
      }
    }
    solicitud.onsuccess = () => resolve(solicitud.result)
    solicitud.onerror = () => reject(solicitud.error)
  })
}

export async function guardarArchivosCampo(
  grupo: GrupoArchivosCampo,
  archivos: File[],
) {
  const base = await abrirBase()
  if (!base) return

  const datos: ArchivoGuardado[] = archivos.map((archivo) => ({
    contenido: archivo,
    nombre: archivo.name,
    tipo: archivo.type,
    ultimaModificacion: archivo.lastModified,
  }))

  await new Promise<void>((resolve, reject) => {
    const transaccion = base.transaction(ALMACEN_ARCHIVOS, "readwrite")
    transaccion.objectStore(ALMACEN_ARCHIVOS).put(datos, grupo)
    transaccion.oncomplete = () => resolve()
    transaccion.onerror = () => reject(transaccion.error)
  })
  base.close()
}

export async function leerArchivosCampo(grupo: GrupoArchivosCampo) {
  const base = await abrirBase()
  if (!base) return [] as File[]

  const datos = await new Promise<ArchivoGuardado[]>((resolve, reject) => {
    const solicitud = base
      .transaction(ALMACEN_ARCHIVOS, "readonly")
      .objectStore(ALMACEN_ARCHIVOS)
      .get(grupo)
    solicitud.onsuccess = () => resolve((solicitud.result as ArchivoGuardado[] | undefined) ?? [])
    solicitud.onerror = () => reject(solicitud.error)
  })
  base.close()

  return datos.map((archivo) => new File(
    [archivo.contenido],
    archivo.nombre,
    {
      type: archivo.tipo,
      lastModified: archivo.ultimaModificacion,
    },
  ))
}

export async function limpiarArchivosCampo() {
  const base = await abrirBase()
  if (!base) return

  await new Promise<void>((resolve, reject) => {
    const transaccion = base.transaction(ALMACEN_ARCHIVOS, "readwrite")
    transaccion.objectStore(ALMACEN_ARCHIVOS).clear()
    transaccion.oncomplete = () => resolve()
    transaccion.onerror = () => reject(transaccion.error)
  })
  base.close()
}
