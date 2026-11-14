import { useState } from "react"
import CampoComercial from "../components/kpiKam/CampoComercial"
import DashboardVisitasRotacion from "../components/kpiKam/DashboardVisitasRotacion"
import RevisionDatosVisitas from "./RevisionDatosVisitas"

type Props = {
  usuario?: string | null
  cerrarSesion: () => void | Promise<void>
}

export default function CampoComercialMovil({ usuario, cerrarSesion }: Props) {
  const [periodo, setPeriodo] = useState(periodoActual())
  const [pantalla, setPantalla] = useState("Comercial · Visitas y rotación")
  return <main className="campo-movil-page">
    <style>{css}</style>
    <header>
      <div><strong>CIBUSPAN <span>ONE</span></strong><small>Campo comercial</small></div>
      <button type="button" onClick={cerrarSesion}>Salir</button>
    </header>
    <div className="campo-movil-contenido">
      <nav className="campo-movil-nav" aria-label="Campo comercial">
        <button type="button" aria-pressed={pantalla === "Comercial · Visitas y rotación"} onClick={() => setPantalla("Comercial · Visitas y rotación")}>Visitas y rotación</button>
        <button type="button" aria-pressed={pantalla === "Dashboard · Visitas y rotación"} onClick={() => setPantalla("Dashboard · Visitas y rotación")}>Dashboards</button>
        <button type="button" aria-pressed={pantalla === "Comercial · Revisión de datos"} onClick={() => setPantalla("Comercial · Revisión de datos")}>Revisión de datos</button>
      </nav>
      <div hidden={pantalla !== "Comercial · Visitas y rotación"}>
        <CampoComercial periodo={periodo} cambiarPeriodo={setPeriodo} onActualizado={() => undefined} soloCampo />
      </div>
      {pantalla === "Dashboard · Visitas y rotación" && <DashboardVisitasRotacion cambiarPantalla={setPantalla} />}
      {pantalla === "Comercial · Revisión de datos" && <RevisionDatosVisitas />}
    </div>
    <footer>{usuario}</footer>
  </main>
}

function periodoActual() {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
}

const css = `
.campo-movil-nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.campo-movil-nav button{padding:8px 12px;border:1px solid #8f1d24;border-radius:9px;background:white;color:#78191f;font:inherit;font-weight:700}
.campo-movil-nav button[aria-pressed="true"]{background:#78191f;color:white}
.campo-movil-page{min-height:100vh;background:#f8f5f1}.campo-movil-page>header{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#78191f;color:#fff;box-shadow:0 3px 14px rgba(65,24,24,.2)}.campo-movil-page>header>div{display:grid}.campo-movil-page>header strong{font-size:18px}.campo-movil-page>header strong span{color:#f7931e}.campo-movil-page>header small{margin-top:2px;color:#f5d9d7}.campo-movil-page>header button{border:1px solid rgba(255,255,255,.4);border-radius:9px;background:transparent;color:#fff;padding:8px 12px;font-weight:900}.campo-movil-contenido{max-width:1100px;margin:0 auto;padding:14px}.campo-movil-page>footer{padding:14px;text-align:center;color:#8a7d77;font-size:11px}@media(max-width:600px){.campo-movil-contenido{padding:10px}}
`
