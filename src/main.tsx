import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import ActualizacionPwa from "./components/ActualizacionPwa.tsx"

createRoot(
  document.getElementById("root")!,
).render(
  <StrictMode>
    <App />
    <ActualizacionPwa />
  </StrictMode>,
)
