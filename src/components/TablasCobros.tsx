import { useEffect, useId, useRef, type ReactNode } from "react"
import { useColumnasAjustables } from "../hooks/useColumnasAjustables"
export function TablaCobros({ modo, titulo, columnas, children }: { modo: string; titulo: string; columnas: string[]; children: ReactNode }) {
  const tabla = useRef<HTMLTableElement>(null)
  const anchos = useColumnasAjustables(`cxc-${modo}`, columnas, tabla)
  return <table ref={tabla} className={`compras-sri-tabla cxc-tabla fin-pagos-tabla${anchos.ajustada ? " fin-pagos-ajustada" : ""}`} aria-label={titulo}
    style={anchos.ajustada ? { width: anchos.total, minWidth: anchos.total, tableLayout: "fixed" } : undefined}>
    <colgroup>{columnas.map(c => <col key={c} style={anchos.ajustada ? { width: anchos.ancho(c) } : undefined} />)}</colgroup>
    <thead><tr>{columnas.map(c => <th key={c} scope="col" aria-label={c}><span className="fin-pagos-titulo-columna">{c}</span>
      <span className="fin-pagos-ajustar-columna" role="separator" aria-orientation="vertical" tabIndex={0} aria-label={`Cambiar ancho de ${c}`} aria-valuemin={40} aria-valuemax={900} aria-valuenow={anchos.ancho(c)}
        title="Arrastra para cambiar el ancho. Flechas para ajustar; doble clic para restablecer."
        onPointerDown={e => anchos.iniciar(e, c)} onPointerMove={anchos.mover} onPointerUp={anchos.terminar} onPointerCancel={anchos.terminar} onLostPointerCapture={anchos.terminar}
        onKeyDown={e => anchos.teclado(e, c)} onDoubleClick={() => anchos.restablecer(c)} /></th>)}</tr></thead>{children}
  </table>
}
export function VentanaCobros({ titulo, cerrar, bloqueado = false, children }: { titulo: string; cerrar: () => void; bloqueado?: boolean; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null), tituloId = useId()
  useEffect(() => {
    const ventana = dialogo.current, anterior = document.activeElement
    ventana?.showModal()
    return () => { ventana?.close(); if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus() }
  }, [])
  return <dialog ref={dialogo} className="cxc-ventana" aria-labelledby={tituloId} onCancel={e => { e.preventDefault(); if (!bloqueado) cerrar() }}
    onClick={e => { if (e.target !== e.currentTarget || bloqueado) return; const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrar() }}>
    <header><h2 id={tituloId}>{titulo}</h2><button type="button" aria-label="Cerrar ventana" disabled={bloqueado} onClick={cerrar}>×</button></header>{children}
  </dialog>
}
