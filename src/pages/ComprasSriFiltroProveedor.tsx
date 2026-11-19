import { useEffect, useId, useRef, useState } from "react"
import { buscarProveedoresSri } from "../repositories/comprasSriRepository"

export default function ComprasSriFiltroProveedor({ proveedor, elegir }: {
  proveedor: string | null
  elegir: (proveedor: string | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const [opciones, setOpciones] = useState<string[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const buscador = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    const espera = window.setTimeout(() => {
      buscarProveedoresSri(texto.trim()).then(
        nombres => { if (vigente) setOpciones(nombres) },
        () => { if (vigente) setError(true) },
      )
    }, 160)
    return () => { vigente = false; window.clearTimeout(espera) }
  }, [abierto, texto, reintento])

  function alternar() {
    if (!menu.current || !boton.current) return
    if (menu.current.matches(":popover-open")) {
      menu.current.hidePopover()
      return
    }
    const ancla = boton.current.getBoundingClientRect()
    menu.current.style.left = `${Math.max(8, Math.min(ancla.left, window.innerWidth - 326))}px`
    menu.current.style.top = `${Math.min(ancla.bottom + 4, Math.max(8, window.innerHeight - 260))}px`
    setTexto("")
    setOpciones(null)
    setError(false)
    menu.current.showPopover()
    buscador.current?.focus()
  }

  function seleccionar(valor: string | null) {
    menu.current?.hidePopover()
    elegir(valor)
  }

  return (
    <>
      <button type="button" className="compras-sri-filtro-boton" ref={boton} aria-controls={id} aria-expanded={abierto}
        aria-label={proveedor ? `Filtrar por proveedor: ${proveedor}` : "Filtrar por proveedor"} onClick={alternar}>
        Proveedor <span aria-hidden="true">▾</span>
      </button>
      <div ref={menu} id={id} popover="auto" className="compras-sri-filtro" role="group" aria-label="Filtro de proveedor"
        onToggle={() => setAbierto(menu.current?.matches(":popover-open") ?? false)}>
        <label>Buscar proveedor
          <input ref={buscador} type="search" placeholder="Escribe las primeras letras" value={texto} maxLength={500}
            onChange={evento => { setOpciones(null); setError(false); setTexto(evento.target.value) }} />
        </label>
        <button type="button" className="compras-sri-filtro-todos" onClick={() => seleccionar(null)}>Todos los proveedores</button>
        {error ? <p role="alert">No se pudieron buscar los proveedores.{" "}
          <button type="button" onClick={() => { setError(false); setReintento(actual => actual + 1) }}>Reintentar</button>
        </p> : !opciones ? <p role="status">Buscando…</p>
          : opciones.length === 0 ? <p role="status">No hay proveedores que coincidan.</p>
          : <ul>{opciones.map(nombre => (
            <li key={nombre}><button type="button" aria-pressed={nombre === proveedor} onClick={() => seleccionar(nombre)}>{nombre}</button></li>
          ))}</ul>}
      </div>
    </>
  )
}
