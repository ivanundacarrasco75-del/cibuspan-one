import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import type { ConsumoProduccion } from "../../utils/consumoProduccion"

type ConsumoGuardado = {
  detalle_id: string; fecha: string; unidades_fabricadas: number; datos: ConsumoProduccion
  movimientos: { id: number; codigo: string; nombre: string; cantidad: number; unidad: string }[]
}
export default function ResumenConsumosProduccion({ produccionId, origen, detalles }: {
  produccionId: string; origen: string; detalles: { detalle_id: string; producto_corto: string }[]
}) {
  const [filas, setFilas] = useState<ConsumoGuardado[]>([])
  const [estado, setEstado] = useState("Consultando consumos…")
  useEffect(() => {
    let activo = true
    setFilas([]); setEstado("Consultando consumos…")
    if (origen !== "APP") { setEstado("Esta OP histórica conserva los consumos reportados para análisis; no se descontaron automáticamente del inventario."); return }
    void (async () => {
      const { data, error } = await supabase.from("pro_consumos_detalle").select("detalle_id,fecha,unidades_fabricadas,datos,movimientos").eq("produccion_id", produccionId).order("detalle_id")
      if (!activo) return
      if (error) { setEstado("No se pudieron consultar los consumos. Esto no significa que sean cero."); return }
      setFilas((data ?? []) as ConsumoGuardado[])
      setEstado(data?.length ? "" : "Esta producción no tiene consumo registrado por el nuevo circuito. No se asume consumo cero ni se descuentan recetas retroactivamente.")
    })().catch(() => { if (activo) setEstado("No se pudieron consultar los consumos. Vuelve a abrir el detalle.") })
    return () => { activo = false }
  }, [produccionId, origen])
  return <section style={{ padding: 14, background: "#f1f6f3", borderRadius: 10, marginTop: 14 }}>
    <h3 style={{ marginTop: 0 }}>Consumos registrados en el Kardex</h3>
    {estado && <p>{estado}</p>}
    {filas.map(f => <details key={f.detalle_id} style={{ marginBottom: 12 }}>
      <summary>{detalles.find(d => d.detalle_id === f.detalle_id)?.producto_corto ?? "Producto"} · {f.fecha} · {f.unidades_fabricadas} Unid. al registrar</summary>
      <p>Referencia: {f.datos.referenciaReceta}. {f.datos.observaciones}</p>
      {f.movimientos.length ? <ul>{f.movimientos.map(m => <li key={m.id}>{m.codigo} · {m.nombre}: {m.cantidad} {m.unidad}</li>)}</ul> : <p>Sin consumo inventariable declarado, con motivo registrado.</p>}
    </details>)}
    {filas.length > 0 && <p>Estos son consumos reales declarados. Editar las unidades producidas no los recalcula. Una corrección de consumo se registra con su motivo y referencia desde el Kardex.</p>}
  </section>
}
