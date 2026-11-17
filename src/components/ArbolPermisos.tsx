import { useEffect, useRef } from "react"
import {
  ARBOL_PERMISOS, rutasDeNodo, RUTAS_SOLO_ADMIN, type NodoPermiso,
} from "../../supabase/functions/_shared/catalogoPermisos"
import "./ArbolPermisos.css"

export default function ArbolPermisos({ seleccionadas, rol, cambiar }: {
  seleccionadas: ReadonlySet<string>
  rol: string
  cambiar: (rutas: string[], permitir: boolean) => void
}) {
  return (
    <div className="arbol-permisos" aria-label="Permisos por módulo y submenú">
      {ARBOL_PERMISOS.map((nodo) => (
        <Rama key={nodo.etiqueta} nodo={nodo} seleccionadas={seleccionadas} rol={rol} cambiar={cambiar} />
      ))}
    </div>
  )
}

function Rama({ nodo, seleccionadas, rol, cambiar }: {
  nodo: NodoPermiso
  seleccionadas: ReadonlySet<string>
  rol: string
  cambiar: (rutas: string[], permitir: boolean) => void
}) {
  const rutas = rutasDeNodo(nodo)
  const modificables = rutas.filter((ruta) => ruta !== "Administración · Usuarios y Permisos" &&
    (rol === "ADMINISTRADOR" || !RUTAS_SOLO_ADMIN.includes(ruta)))
  const activas = rutas.filter((ruta) => seleccionadas.has(ruta)).length
  const opcionesParaEstado = modificables.length ? modificables : rutas
  const activasParaEstado = opcionesParaEstado.filter((ruta) => seleccionadas.has(ruta)).length
  const marcado = activasParaEstado === opcionesParaEstado.length
  const parcial = activasParaEstado > 0 && !marcado
  const casilla = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (casilla.current) casilla.current.indeterminate = parcial
  }, [parcial])

  const control = (
    <label className="arbol-permisos-casilla">
      <input ref={casilla} type="checkbox" checked={marcado}
        disabled={modificables.length === 0}
        onChange={(evento) => cambiar(modificables, evento.target.checked)} />
      <span>{nodo.etiqueta}</span>
      {modificables.length === 0 && <small>Según rol administrador</small>}
    </label>
  )
  if (!nodo.hijos) return <div className="arbol-permisos-hoja">{control}</div>
  return (
    <div className="arbol-permisos-rama">
      {control}
      <details>
        <summary>Ver opciones <span>{activas} de {rutas.length} activas</span></summary>
        <div className="arbol-permisos-hijos">
          {nodo.hijos.map((hijo) => (
            <Rama key={hijo.ruta ?? hijo.etiqueta} nodo={hijo} seleccionadas={seleccionadas} rol={rol} cambiar={cambiar} />
          ))}
        </div>
      </details>
    </div>
  )
}
