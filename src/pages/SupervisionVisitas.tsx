import { useEffect, useState } from "react"
import SupervisionCampo from "../components/kpiKam/SupervisionCampo"
import { obtenerCatalogoCampoComercial } from "../repositories/campoComercialRepository"

export default function SupervisionVisitas() {
  const [clientes, setClientes] = useState<Array<{ id: string; nombre: string }> | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    let vigente = true
    const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" })
    void obtenerCatalogoCampoComercial(null, fecha, fecha)
      .then((datos) => { if (vigente) setClientes(datos.clientes) })
      .catch((err) => { if (vigente) setError(err instanceof Error ? err.message : "No se pudo abrir el reporte.") })
    return () => { vigente = false }
  }, [])
  if (error) return <p role="alert">{error}</p>
  if (!clientes) return <p>Cargando reporte…</p>
  return <SupervisionCampo clientes={clientes} />
}
