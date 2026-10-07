import { useEffect, useRef, useState } from "react"
import { catalogosAltaInventario, candidatosAltaInventario, guardarAltaArticuloInventario,
  type ArticuloAltaInventario } from "../../repositories/altaArticuloInventarioRepository"
import { unidadAltaInventario, type ClaseAltaInventario } from "../../utils/altaArticuloInventario"
import type { LineaInventarioInicial, TipoInventario } from "../../utils/inventarioInicialExcel"

export default function CrearArticuloInventario({ fila, onVinculado, onCerrar }: {
  fila: LineaInventarioInicial; onVinculado: (articulo: { id: string; tipo: TipoInventario }) => Promise<void>; onCerrar: () => void
}) {
  const [codigo, setCodigo] = useState(fila.codigo)
  const [nombre, setNombre] = useState(fila.nombre)
  const [clase, setClase] = useState<ClaseAltaInventario | "">("")
  const [unidad, setUnidad] = useState(unidadAltaInventario(fila.unidadArchivo))
  const [vida, setVida] = useState("")
  const [parada, setParada] = useState("")
  const [reactivar, setReactivar] = useState(false)
  const [catalogo, setCatalogo] = useState<ArticuloAltaInventario[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const dialogo = useRef<HTMLDialogElement>(null)
  const candidatos = candidatosAltaInventario(codigo, catalogo)
  const existente = candidatos.length === 1 ? candidatos[0] : null
  useEffect(() => {
    const elemento = dialogo.current
    elemento?.showModal()
    return () => { elemento?.close() }
  }, [])
  useEffect(() => {
    let vigente = true
    void catalogosAltaInventario().then((lista) => { if (vigente) { setCatalogo(lista); setCargando(false) } })
      .catch((e) => { if (vigente) setError(e.message) })
    return () => { vigente = false }
  }, [])
  async function guardar() {
    if (guardando || cargando) return
    setGuardando(true); setError("")
    try {
      const resultado = await guardarAltaArticuloInventario({ clase, codigo, nombre, unidad, vidaUtilDias: Number(vida), loteProduccion: Number(parada), reactivar })
      await onVinculado(resultado)
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }
  return <dialog ref={dialogo} aria-labelledby="titulo-alta-inventario" className="alta-inventario" onCancel={(e) => { e.preventDefault(); if (!guardando) onCerrar() }}>
    <h2 id="titulo-alta-inventario">Crear o vincular artículo de la fila {fila.fila}</h2>
    <p>Se registra el artículo en el catálogo. El stock del Excel se guardará cuando confirmes la carga de saldos.</p>
    {cargando && !error && <p>Revisando códigos existentes, incluidos los inactivos…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="campos"><label>Código<input value={codigo} disabled={guardando} onChange={(e) => { setCodigo(e.target.value); setReactivar(false) }} /></label>
      {existente ? <p>{existente.nombre} · {existente.unidad} · {existente.activo ? "Ya existe: se vinculará sin duplicarlo." : "Existe, pero está inactivo."}</p> : <>
        <label>Nombre<input value={nombre} disabled={guardando} onChange={(e) => setNombre(e.target.value)} /></label>
        <label>Tipo de artículo<select value={clase} disabled={guardando} onChange={(e) => {
          const valor = e.target.value as ClaseAltaInventario; setClase(valor); if (valor === "PRODUCTO_TERMINADO") setUnidad("UNIDAD")
        }}><option value="">Elegir tipo…</option><option value="MATERIA_PRIMA">Materia prima</option><option value="EMPAQUE">Empaque</option>
          <option value="MICRO">Micro preparado</option><option value="PRODUCTO_TERMINADO">Producto terminado</option></select></label>
        <label>Unidad<select value={unidad} disabled={guardando || clase === "PRODUCTO_TERMINADO"} onChange={(e) => setUnidad(e.target.value as "KG" | "UNIDAD" | "")}>
          <option value="">Elegir unidad…</option><option value="KG">KG</option><option value="UNIDAD">UNIDAD</option></select></label>
        {clase === "PRODUCTO_TERMINADO" && <><label>Vida útil (días)<input type="number" min="1" step="1" value={vida} disabled={guardando} onChange={(e) => setVida(e.target.value)} /></label>
          <label>Unidades por parada<input type="number" min="1" step="1" value={parada} disabled={guardando} onChange={(e) => setParada(e.target.value)} /></label></>}
      </>}
    </div>
    {existente && !existente.activo && <label className="check"><input type="checkbox" checked={reactivar} disabled={guardando} onChange={(e) => setReactivar(e.target.checked)} />Activar este artículo existente para incluirlo en la carga.</label>}
    {candidatos.length > 1 && <p className="error">El código coincide con varios artículos. Cierra este formulario y vincula el correcto en la lista.</p>}
    {clase === "MICRO" && !existente && <p>El micro se registrará para controlar su stock, sin costo directo para evitar duplicar el costo de sus ingredientes. Su receta se configura en Producción.</p>}
    <button className="principal" disabled={cargando || guardando || candidatos.length > 1 || (!!existente && !existente.activo && !reactivar)} onClick={() => void guardar()}>
      {guardando ? "Guardando…" : existente ? existente.activo ? "Vincular existente" : "Activar y vincular" : "Crear y vincular"}</button>
    <button disabled={guardando} onClick={onCerrar}>Cancelar sin crear</button>
  </dialog>
}
