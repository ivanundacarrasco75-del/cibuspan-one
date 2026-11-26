import { useEffect, useState } from "react"
import { semanaEmisionCobro } from "../utils/plazosCobros"
import { semanasDelAnio } from "../utils/semanasPago"

type Props = { value: string; onChange: (semana: string) => void; etiqueta: string; disabled?: boolean; required?: boolean; name?: string }
export default function SelectorSemanaPago({ value, onChange, etiqueta, disabled = false, required = false, name }: Props) {
  const actual = semanaEmisionCobro(new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format())!
  const info = semanaEmisionCobro(value)
  const [anio, setAnio] = useState(() => Number((info ?? actual).etiqueta.slice(0, 4)))
  useEffect(() => { const semana = semanaEmisionCobro(value); if (semana) setAnio(Number(semana.etiqueta.slice(0, 4))) }, [value])
  const anioActual = Number(actual.etiqueta.slice(0, 4))
  const anios = [...new Set([...Array.from({ length: 21 }, (_, i) => anioActual - 10 + i), anio])].sort((a,b) => a-b)
  return <span className="semana-pago-selector">
    <select className="semana-pago-anio" aria-label={`Año de ${etiqueta}`} value={anio} disabled={disabled} onChange={e => {
      const nuevo = Number(e.target.value), numero = info ? Number(info.etiqueta.slice(-2)) : null
      setAnio(nuevo)
      if (numero !== null) onChange(semanasDelAnio(nuevo)[numero - 1]?.desde ?? (required ? semanasDelAnio(nuevo)[0].desde : ""))
    }}>{anios.map(year => <option key={year} value={year}>{year}</option>)}</select>
    <select className="semana-pago-numero" aria-label={etiqueta} value={info?.desde ?? ""} disabled={disabled} required={required} onChange={e => onChange(e.target.value)}>
      <option value="" disabled={required}>{required ? "Escoger semana" : "Sin semana"}</option>
      {semanasDelAnio(anio).map(semana => <option key={semana.numero} value={semana.desde}>Semana {String(semana.numero).padStart(2,"0")}</option>)}
    </select>
    {name && <input type="hidden" name={name} value={info?.desde ?? ""} disabled={disabled} />}
  </span>
}
