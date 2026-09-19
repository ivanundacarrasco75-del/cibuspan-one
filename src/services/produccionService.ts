import { skus } from "../data/skus"

export type DetalleEjecucion = {
  codigo: string
  lote: string
  unidades: number
}

type ProgramaProduccion = {
  id: string
  fechaProduccion: string
  fechaEntrega: string
  totalProgramado: number
  productos: {
    codigo: string
    corto: string
    lotesProgramados: number
    unidadesProgramadas: number
  }[]
  estado: string
}

type RegistroInventario = {
  id: string
  codigo: string
  lote: string
  fechaProduccion: string
  fechaVencimiento: string
  cantidad: number
}

function sumarDias(fecha: string, dias: number) {
  const resultado = new Date(`${fecha}T12:00:00`)
  resultado.setDate(resultado.getDate() + dias)

  return resultado.toISOString().slice(0, 10)
}

export function obtenerProgramas(): ProgramaProduccion[] {
  return JSON.parse(
    localStorage.getItem(
      "cibuspan-programas-produccion",
    ) ?? "[]",
  )
}

export function obtenerProgramasPendientes() {
  return obtenerProgramas().filter(
    (programa) => programa.estado === "PROGRAMADO",
  )
}

export function ejecutarPrograma(
  programaId: string,
  fechaProduccionReal: string,
  detalles: DetalleEjecucion[],
) {
  if (!fechaProduccionReal) {
    throw new Error(
      "Debes seleccionar la fecha real de producción.",
    )
  }

  if (detalles.length === 0) {
    throw new Error(
      "Debes ingresar al menos un lote producido.",
    )
  }

  detalles.forEach((detalle) => {
    if (!detalle.lote.trim()) {
      throw new Error(
        `Falta ingresar el lote del SKU ${detalle.codigo}.`,
      )
    }

    if (detalle.unidades <= 0) {
      throw new Error(
        `Las unidades del SKU ${detalle.codigo} deben ser mayores a cero.`,
      )
    }
  })

  const programas = obtenerProgramas()

  const programa = programas.find(
    (item) => item.id === programaId,
  )

  if (!programa) {
    throw new Error(
      "No se encontró el programa de producción.",
    )
  }

  if (programa.estado !== "PROGRAMADO") {
    throw new Error(
      "Este programa ya fue ejecutado o cancelado.",
    )
  }

  const inventarioActual: RegistroInventario[] =
    JSON.parse(
      localStorage.getItem("cibuspan-inventario") ??
        "[]",
    )

  const nuevasEntradas: RegistroInventario[] =
    detalles.map((detalle, indice) => {
      const producto = skus.find(
        (item) => item.codigo === detalle.codigo,
      )

      if (!producto) {
        throw new Error(
          `No se encontró el SKU ${detalle.codigo}.`,
        )
      }

      return {
        id: `INV-${Date.now()}-${indice}`,
        codigo: detalle.codigo,
        lote: detalle.lote.trim().toUpperCase(),
        fechaProduccion: fechaProduccionReal,
        fechaVencimiento: sumarDias(
          fechaProduccionReal,
          producto.vidaUtil,
        ),
        cantidad: detalle.unidades,
      }
    })

  localStorage.setItem(
    "cibuspan-inventario",
    JSON.stringify([
      ...inventarioActual,
      ...nuevasEntradas,
    ]),
  )

  const programasActualizados = programas.map(
    (item) =>
      item.id === programaId
        ? {
            ...item,
            estado: "EJECUTADO",
            fechaProduccionReal,
            detallesEjecucion: detalles,
            fechaEjecucion:
              new Date().toISOString(),
          }
        : item,
  )

  localStorage.setItem(
    "cibuspan-programas-produccion",
    JSON.stringify(programasActualizados),
  )
}