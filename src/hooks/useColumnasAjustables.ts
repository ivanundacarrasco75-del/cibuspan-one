import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react"

type Anchos = Record<string, number>
const limitar = (ancho: number) => Math.max(40, Math.min(900, Math.round(ancho)))
function leer(clave: string): Anchos {
  try {
    const datos: unknown = JSON.parse(localStorage.getItem(clave) ?? "{}")
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return {}
    return Object.fromEntries(Object.entries(datos).filter(([, valor]) => typeof valor === "number" && Number.isFinite(valor) && valor >= 40 && valor <= 900))
  } catch { return {} }
}
export function useColumnasAjustables(modo: string, titulos: string[], tabla: RefObject<HTMLTableElement | null>) {
  const clave = `cibuspan-one:finanzas:anchos-columnas:${modo}:v1`
  const [anchos, setAnchos] = useState<Anchos>(() => leer(clave))
  const arrastre = useRef<{ id: number; inicio: number; columna: string; base: Anchos; actual: Anchos } | null>(null)
  useEffect(() => { setAnchos(leer(clave)); arrastre.current = null }, [clave])
  const predeterminado = (columna: string) => columna === "Descripción" ? 240 : columna === "Proveedor" ? 200 : columna === "Pagos" && modo === "semana" ? 180 : 110
  function medir(): Anchos {
    const celdas = tabla.current?.tHead?.rows[0]?.cells
    return Object.fromEntries(titulos.map((titulo, indice) => [titulo, anchos[titulo] ?? limitar(celdas?.[indice]?.getBoundingClientRect().width ?? predeterminado(titulo))]))
  }
  function guardar(siguientes: Anchos) {
    setAnchos(siguientes)
    try { localStorage.setItem(clave, JSON.stringify(siguientes)) } catch { /* La tabla sigue funcionando si el navegador bloquea el almacenamiento. */ }
  }
  function iniciar(evento: PointerEvent<HTMLSpanElement>, columna: string) {
    if (evento.button !== 0 || !evento.isPrimary) return
    evento.preventDefault(); evento.stopPropagation()
    const base = medir()
    arrastre.current = { id: evento.pointerId, inicio: evento.clientX, columna, base, actual: base }
    setAnchos(base)
    evento.currentTarget.setPointerCapture(evento.pointerId)
  }
  function mover(evento: PointerEvent<HTMLSpanElement>) {
    const activo = arrastre.current
    if (!activo || activo.id !== evento.pointerId) return
    activo.actual = { ...activo.base, [activo.columna]: limitar(activo.base[activo.columna] + evento.clientX - activo.inicio) }
    setAnchos(activo.actual)
  }
  function terminar(evento: PointerEvent<HTMLSpanElement>) {
    const activo = arrastre.current
    if (!activo || activo.id !== evento.pointerId) return
    arrastre.current = null; guardar(activo.actual)
  }
  function teclado(evento: KeyboardEvent<HTMLSpanElement>, columna: string) {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(evento.key)) return
    evento.preventDefault()
    const base = medir()
    guardar({ ...base, [columna]: evento.key === "Home" ? predeterminado(columna) : limitar(base[columna] + (evento.key === "ArrowRight" ? 1 : -1) * (evento.shiftKey ? 25 : 10)) })
  }
  return {
    ajustada: Object.keys(anchos).length > 0,
    ancho: (columna: string) => anchos[columna] ?? predeterminado(columna),
    total: titulos.reduce((suma, titulo) => suma + (anchos[titulo] ?? predeterminado(titulo)), 0),
    iniciar, mover, terminar, teclado,
    restablecer: (columna: string) => guardar({ ...medir(), [columna]: predeterminado(columna) }),
  }
}
