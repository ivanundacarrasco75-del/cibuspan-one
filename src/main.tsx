import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "./components/kpiKam/DashboardVisitasRotacion.css"
import App from "./App.tsx"
import ActualizacionPwa from "./components/ActualizacionPwa.tsx"
import InstalarApp from "./components/InstalarApp"

createRoot(
  document.getElementById("root")!,
).render(
  <StrictMode>
    <InstalarApp />
    <App />
    <ActualizacionPwa />
  </StrictMode>,
)
