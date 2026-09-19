import { useEffect, useState } from "react"

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)

  useEffect(() => {
    function preparar(event: Event) {
      event.preventDefault()
      setEvento(event as EventoInstalacion)
    }

    function instalada() {
      setEvento(null)
    }

    window.addEventListener("beforeinstallprompt", preparar)
    window.addEventListener("appinstalled", instalada)

    return () => {
      window.removeEventListener("beforeinstallprompt", preparar)
      window.removeEventListener("appinstalled", instalada)
    }
  }, [])

  if (!evento) return null

  return (
    <button
      type="button"
      style={boton}
      onClick={async () => {
        await evento.prompt()
        await evento.userChoice
        setEvento(null)
      }}
    >
      <span style={icono}>↓</span>
      Instalar CIBUSPAN ONE
    </button>
  )
}

const boton: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: "calc(82px + env(safe-area-inset-bottom))",
  zIndex: 1200,
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(255,255,255,.25)",
  borderRadius: 999,
  padding: "10px 15px",
  background: "#8F1D24",
  color: "white",
  boxShadow: "0 10px 30px rgba(104,21,26,.28)",
  fontWeight: 750,
  cursor: "pointer",
}

const icono: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 22,
  height: 22,
  borderRadius: 999,
  background: "#F7931E",
  fontSize: 16,
}
