import { useState } from "react"
import Produccion from "./Produccion"
import EjecutarProduccion from "./EjecutarProduccion"

type Pestana = "programacion" | "ejecucion" | "historial"

export default function ProduccionModulo() {
  const [pestana, setPestana] =
    useState<Pestana>("programacion")

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "20px 30px 0",
          borderBottom: "1px solid #dddddd",
          background: "white",
        }}
      >
        <button
          type="button"
          onClick={() => setPestana("programacion")}
          style={botonPestana(
            pestana === "programacion",
          )}
        >
          Programación
        </button>

        <button
          type="button"
          onClick={() => setPestana("ejecucion")}
          style={botonPestana(
            pestana === "ejecucion",
          )}
        >
          Ejecución
        </button>

        <button
          type="button"
          onClick={() => setPestana("historial")}
          style={botonPestana(
            pestana === "historial",
          )}
        >
          Historial
        </button>
      </div>

      {pestana === "programacion" && <Produccion />}

      {pestana === "ejecucion" && (
        <EjecutarProduccion />
      )}

      {pestana === "historial" && (
        <HistorialProduccion />
      )}
    </div>
  )
}

function HistorialProduccion() {
  const programas = JSON.parse(
    localStorage.getItem(
      "cibuspan-programas-produccion",
    ) ?? "[]",
  )

  const ejecutados = programas.filter(
    (programa: { estado: string }) =>
      programa.estado === "EJECUTADO",
  )

  return (
    <div style={{ padding: "30px" }}>
      <h1>Historial de producción</h1>

      {ejecutados.length === 0 ? (
        <p>No existen programas ejecutados.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tabla}>
            <thead>
              <tr>
                <th style={encabezado}>Programa</th>
                <th style={encabezado}>
                  Fecha producción
                </th>
                <th style={encabezado}>
                  Fecha entrega
                </th>
                <th style={encabezado}>
                  Lotes programados
                </th>
                <th style={encabezado}>Estado</th>
              </tr>
            </thead>

            <tbody>
              {[...ejecutados]
                .reverse()
                .map(
                  (programa: {
                    id: string
                    fechaProduccionReal?: string
                    fechaProduccion: string
                    fechaEntrega: string
                    totalProgramado: number
                    estado: string
                  }) => (
                    <tr key={programa.id}>
                      <td style={celda}>
                        {programa.id}
                      </td>

                      <td style={celda}>
                        {programa.fechaProduccionReal ??
                          programa.fechaProduccion}
                      </td>

                      <td style={celda}>
                        {programa.fechaEntrega}
                      </td>

                      <td style={celda}>
                        {programa.totalProgramado}
                      </td>

                      <td style={celda}>
                        {programa.estado}
                      </td>
                    </tr>
                  ),
                )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function botonPestana(activa: boolean) {
  return {
    padding: "13px 20px",
    border: "none",
    borderBottom: activa
      ? "3px solid #8f1d24"
      : "3px solid transparent",
    background: "transparent",
    color: activa ? "#8f1d24" : "#555555",
    fontWeight: activa ? "bold" : "normal",
    cursor: "pointer",
  }
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
  background: "white",
}

const encabezado = {
  padding: "12px",
  textAlign: "left" as const,
  borderBottom: "2px solid #dddddd",
}

const celda = {
  padding: "12px",
  borderBottom: "1px solid #eeeeee",
}