import { supabase } from "../lib/supabase"

export type BaseDistribucion =
  | "VENTAS_NETAS"
  | "UNIDADES"
  | "KG_EQUIVALENTE"

export type ReglaDistribucionDb = {
  codigo: string
  nombre: string
  descripcion: string
  base_distribucion: BaseDistribucion
  actualizado_en?: string | null
}

export const REGLAS_DISTRIBUCION_PREDETERMINADAS: ReglaDistribucionDb[] = [
  {
    codigo: "PERSONAL_PRODUCCION",
    nombre: "Personal de producción",
    descripcion:
      "Distribuye mano de obra directa e indirecta entre los SKU producidos.",
    base_distribucion: "KG_EQUIVALENTE",
  },
  {
    codigo: "TRANSPORTE",
    nombre: "Transporte y distribución",
    descripcion:
      "Distribuye transporte y movilización entre los movimientos comerciales.",
    base_distribucion: "UNIDADES",
  },
  {
    codigo: "OPERACION",
    nombre: "Operación y producción",
    descripcion:
      "Distribuye gastos operativos fabriles compartidos.",
    base_distribucion: "KG_EQUIVALENTE",
  },
  {
    codigo: "PERSONAL_ESTRUCTURA",
    nombre: "Personal de estructura",
    descripcion:
      "Distribuye personal administrativo y comercial compartido.",
    base_distribucion: "VENTAS_NETAS",
  },
  {
    codigo: "ESTRUCTURA_GENERAL",
    nombre: "Estructura general",
    descripcion:
      "Distribuye los demás gastos generales que impactan EBITDA.",
    base_distribucion: "VENTAS_NETAS",
  },
]

const CLAVE_LOCAL =
  "cibuspan_one_reglas_distribucion_rentabilidad"

const TABLAS_CANDIDATAS = [
  "fin_reglas_distribucion",
  "fin_reglas_distribucion_rentabilidad",
  "fin_rentabilidad_reglas_distribucion",
] as const

function esBaseDistribucion(
  valor: unknown,
): valor is BaseDistribucion {
  return (
    valor === "VENTAS_NETAS" ||
    valor === "UNIDADES" ||
    valor === "KG_EQUIVALENTE"
  )
}

function combinarConPredeterminadas(
  filas:
    | Array<{
        codigo?: unknown
        nombre?: unknown
        descripcion?: unknown
        base_distribucion?: unknown
        actualizado_en?: unknown
      }>
    | null
    | undefined,
) {
  const porCodigo = new Map<
    string,
    ReglaDistribucionDb
  >()

  for (const regla of REGLAS_DISTRIBUCION_PREDETERMINADAS) {
    porCodigo.set(regla.codigo, { ...regla })
  }

  for (const fila of filas ?? []) {
    const codigo = String(
      fila.codigo ?? "",
    ).trim()

    if (!codigo) continue

    const base = esBaseDistribucion(
      fila.base_distribucion,
    )
      ? fila.base_distribucion
      : porCodigo.get(codigo)
          ?.base_distribucion ??
        "VENTAS_NETAS"

    const actual = porCodigo.get(codigo)

    porCodigo.set(codigo, {
      codigo,
      nombre:
        String(
          fila.nombre ??
            actual?.nombre ??
            codigo,
        ).trim() || codigo,
      descripcion:
        String(
          fila.descripcion ??
            actual?.descripcion ??
            "",
        ).trim(),
      base_distribucion: base,
      actualizado_en:
        fila.actualizado_en == null
          ? actual?.actualizado_en ?? null
          : String(
              fila.actualizado_en,
            ),
    })
  }

  return Array.from(
    porCodigo.values(),
  )
}

function leerLocal() {
  if (
    typeof window === "undefined" ||
    !window.localStorage
  ) {
    return null
  }

  try {
    const texto =
      window.localStorage.getItem(
        CLAVE_LOCAL,
      )

    if (!texto) return null

    const datos = JSON.parse(texto)
    return Array.isArray(datos)
      ? combinarConPredeterminadas(datos)
      : null
  } catch {
    return null
  }
}

function guardarLocal(
  reglas: ReglaDistribucionDb[],
) {
  if (
    typeof window === "undefined" ||
    !window.localStorage
  ) {
    return
  }

  try {
    window.localStorage.setItem(
      CLAVE_LOCAL,
      JSON.stringify(reglas),
    )
  } catch {
    // El cálculo puede continuar con las reglas en memoria.
  }
}

async function leerTabla(
  tabla: string,
) {
  const { data, error } = await supabase
    .from(tabla)
    .select(
      "codigo,nombre,descripcion,base_distribucion,actualizado_en",
    )

  if (error) {
    return null
  }

  return combinarConPredeterminadas(
    data as Array<{
      codigo?: unknown
      nombre?: unknown
      descripcion?: unknown
      base_distribucion?: unknown
      actualizado_en?: unknown
    }>,
  )
}

export async function obtenerReglasDistribucionDb() {
  // Primero intenta recuperar la configuración persistente
  // en Supabase. Si la tabla histórica usa otro nombre o
  // no está disponible, conserva la app operativa con la
  // copia local / reglas predeterminadas.
  for (const tabla of TABLAS_CANDIDATAS) {
    try {
      const reglas = await leerTabla(
        tabla,
      )
      if (reglas) {
        guardarLocal(reglas)
        return reglas
      }
    } catch {
      // Prueba la siguiente fuente.
    }
  }

  return (
    leerLocal() ??
    REGLAS_DISTRIBUCION_PREDETERMINADAS.map(
      (regla) => ({ ...regla }),
    )
  )
}

export async function guardarReglasDistribucionDb(
  reglas: Array<{
    codigo: string
    base_distribucion: BaseDistribucion
  }>,
) {
  const actuales =
    await obtenerReglasDistribucionDb()

  const mapa = new Map(
    actuales.map((regla) => [
      regla.codigo,
      { ...regla },
    ]),
  )

  for (const cambio of reglas) {
    const actual =
      mapa.get(cambio.codigo)

    if (!actual) continue

    mapa.set(cambio.codigo, {
      ...actual,
      base_distribucion:
        cambio.base_distribucion,
    })
  }

  const consolidadas =
    Array.from(mapa.values())

  // Se guarda localmente siempre, para no perder la
  // configuración si la fuente remota no está disponible.
  guardarLocal(consolidadas)

  // Intenta mantener compatibilidad con la tabla remota
  // que ya pudiera existir en el proyecto.
  for (const tabla of TABLAS_CANDIDATAS) {
    try {
      const { error } = await supabase
        .from(tabla)
        .upsert(
          consolidadas.map((regla) => ({
            codigo: regla.codigo,
            nombre: regla.nombre,
            descripcion:
              regla.descripcion,
            base_distribucion:
              regla.base_distribucion,
          })),
          {
            onConflict: "codigo",
          },
        )

      if (!error) {
        return consolidadas
      }
    } catch {
      // Si no existe esa tabla, continúa.
    }
  }

  // La configuración local sigue siendo válida para
  // mantener operativo el dashboard.
  return consolidadas
}
