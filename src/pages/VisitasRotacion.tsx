import { useState } from "react"
import CampoComercial from "../components/kpiKam/CampoComercial"

export default function VisitasRotacion({ cambiarPantalla }: { cambiarPantalla?: (pantalla: string) => void }) {
  const [periodo, setPeriodo] = useState(periodoActual())
  const [, setActualizacion] = useState(0)

  return (
    <CampoComercial
      periodo={periodo}
      cambiarPeriodo={setPeriodo}
      onActualizado={() => setActualizacion((valor) => valor + 1)}
      cambiarPantalla={cambiarPantalla}
    />
  )
}

function periodoActual() {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
}
