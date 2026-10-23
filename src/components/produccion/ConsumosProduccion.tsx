import { useEffect, useRef, useState } from "react"
import { catalogoKardex } from "../../repositories/kardexRepository"
import { obtenerReferenciasConsumoOp } from "../../repositories/comparacionConsumosOpRepository"
import { sugerirConsumoProduccion, type ConsumoProduccion, type MateriaConsumo } from "../../utils/consumoProduccion"
import type { ReferenciaRecetaOp } from "../../utils/comparacionConsumosOp"

type Registro = { producto: { producto_id: string; codigo: string; corto: string }; unidades: number; consumoMp?: ConsumoProduccion }
export default function ConsumosProduccion({ registros, esSemi, cambiar }: {
  registros: Registro[]; esSemi: (id: string) => boolean; cambiar: (id: string, c: ConsumoProduccion) => void
}) {
  const [materias, setMaterias] = useState<MateriaConsumo[]>([])
  const [referencias, setReferencias] = useState<ReferenciaRecetaOp[]>([])
  const [avisos, setAvisos] = useState<Record<string, string[]>>({})
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)
  const actual = useRef({ registros, esSemi, cambiar }); actual.current = { registros, esSemi, cambiar }
  const clave = registros.map(r => r.producto.producto_id).join("|")
  useEffect(() => {
    let activo = true
    setCargando(true); setError("")
    async function cargar() {
      try {
        const [catalogo, recetas] = await Promise.allSettled([
          catalogoKardex(),
          obtenerReferenciasConsumoOp(actual.current.registros.map(r => ({ producto_codigo: r.producto.codigo, producto_nombre: r.producto.corto, tipo_orden: "SKU" }))),
        ])
        if (!activo) return
        if (catalogo.status === "rejected") throw catalogo.reason
        const mp = catalogo.value.articulos.filter(a => a.tipo === "MATERIA_PRIMA").map(a => ({ id: a.id, codigo: a.codigo, nombre: a.nombre, unidad: a.unidad, saldo: Number(a.saldo), iniciado: a.iniciado }))
        const refs = recetas.status === "fulfilled" ? recetas.value : []
        setMaterias(mp); setReferencias(refs)
        const mensajes: Record<string, string[]> = {}
        for (const r of actual.current.registros) {
          const ref = refs.find(f => f.codigoProducto === r.producto.codigo)
          const s = sugerirConsumoProduccion(ref, r.unidades, mp, actual.current.esSemi(r.producto.producto_id))
          mensajes[r.producto.producto_id] = s.avisos
          if (recetas.status === "rejected") mensajes[r.producto.producto_id].push("No se pudieron consultar las recetas. Puedes ingresar el consumo real manualmente.")
          if (!r.consumoMp) actual.current.cambiar(r.producto.producto_id, s.consumo)
        }
        setAvisos(mensajes)
      } catch (e) { if (activo) setError(e instanceof Error ? e.message : "No se pudo cargar el consumo.") }
      finally { if (activo) setCargando(false) }
    }
    void cargar(); return () => { activo = false }
  }, [clave])
  return <section style={{ marginTop: 18, padding: 14, border: "1px solid #b8cabe", borderRadius: 10 }}>
    <h3 style={{ marginTop: 0 }}>Materias primas y empaques utilizados</h3>
    <p>La receta propone cantidades para las unidades indicadas. Revisa y ajusta lo realmente utilizado. Se descontará del Kardex junto con esta producción.</p>
    <p>Cambiar las unidades producidas no recalcula estos consumos. Puedes conservar lo realmente utilizado o usar Volver a calcular con receta para obtener otra propuesta.</p>
    <p>Si utilizas un micro ya preparado, registra ese micro; no vuelvas a incluir sus ingredientes. La fecha de consumo será la fecha de producción de cada SKU.</p>
    {cargando && <p role="status">Consultando catálogo y recetas…</p>}
    {error && <p role="alert" style={{ color: "#a52222" }}>{error}</p>}
    {!cargando && !error && registros.map(r => {
      const id = r.producto.producto_id, c = r.consumoMp
      if (!c) return null
      const editar = (parche: Partial<ConsumoProduccion>) => cambiar(id, { ...c, ...parche, confirmado: false })
      return <div key={id} style={{ borderTop: "1px solid #ccc", paddingTop: 12, marginTop: 12 }}>
        <h4 style={{ margin: "0 0 8px" }}>{r.producto.corto} · {r.unidades} Unid.</h4>
        <small>Referencia: {c.referenciaReceta}</small>
        {(avisos[id] ?? []).map(a => <p key={a} style={{ color: "#78511c", margin: "6px 0" }}>{a}</p>)}
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", minWidth: 510, textAlign: "left" }}>
            <thead><tr><th>Material</th><th>Cantidad utilizada</th><th>Unidad</th><th>Stock actual</th><th /></tr></thead>
            <tbody>{c.lineas.map((l, i) => {
              const m = materias.find(x => x.id === l.materiaPrimaId)
              return <tr key={i}><td><select aria-label={`Material ${i + 1} de ${r.producto.corto}`} value={l.materiaPrimaId} style={{ width: "100%", minHeight: 38 }}
                onChange={e => { const m = materias.find(x => x.id === e.target.value); editar({ lineas: c.lineas.map((v, n) => n === i ? { materiaPrimaId: m?.id ?? "", unidad: m?.unidad ?? "", cantidad: v.cantidad } : v) }) }}>
                <option value="">Selecciona material</option>{materias.map(m => <option key={m.id} value={m.id}>{m.codigo} · {m.nombre}</option>)}
              </select></td><td><input type="number" min="0.000001" step={l.unidad === "UNIDAD" ? "1" : "0.000001"} aria-label={`Consumo ${i + 1} de ${r.producto.corto}`}
                style={{ width: 120, minHeight: 38 }} value={Number.isFinite(l.cantidad) ? l.cantidad : ""}
                onChange={e => editar({ lineas: c.lineas.map((v, n) => n === i ? { ...v, cantidad: e.target.value === "" ? NaN : Number(e.target.value) } : v) })} /></td>
                <td>{l.unidad || "—"}</td><td>{m?.iniciado === false ? "Falta saldo inicial" : m?.saldo ?? "—"}</td><td><button type="button" onClick={() => editar({ lineas: c.lineas.filter((_, n) => n !== i) })}>Quitar</button></td></tr>
            })}</tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
          <button type="button" onClick={() => editar({ lineas: [...c.lineas, { materiaPrimaId: "", unidad: "", cantidad: 0 }] })}>Agregar material</button>
          <button type="button" onClick={() => {
            if (c.lineas.length && !window.confirm("Esto reemplazará las cantidades de este SKU por la receta para sus unidades actuales. ¿Continuar?")) return
            const s = sugerirConsumoProduccion(referencias.find(f => f.codigoProducto === r.producto.codigo), r.unidades, materias, esSemi(id))
            cambiar(id, s.consumo); setAvisos(a => ({ ...a, [id]: s.avisos }))
          }}>Volver a calcular con receta</button>
        </div>
        <label style={{ display: "block" }}>Observaciones del consumo{!c.lineas.length ? " (explica por qué no hubo consumo inventariable; mínimo 10 caracteres)" : " / diferencias frente a receta"}
          <textarea rows={2} maxLength={2000} value={c.observaciones} style={{ display: "block", width: "100%", boxSizing: "border-box" }} onChange={e => editar({ observaciones: e.target.value })} />
        </label>
        <label style={{ display: "flex", gap: 8, marginTop: 10 }}><input type="checkbox" checked={c.confirmado} onChange={e => cambiar(id, { ...c, confirmado: e.target.checked })} />
          Confirmo que estos materiales y cantidades corresponden al consumo real de este SKU.
        </label>
      </div>
    })}
  </section>
}
