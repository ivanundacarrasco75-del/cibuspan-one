import { useEffect, useRef, useState } from "react"
import "./InstalarApp.css"

interface EventoInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [instalada, setInstalada] = useState(() => estaInstalada())
  const [ayuda, setAyuda] = useState(() => new URLSearchParams(window.location.search).get("instalar") === "1")
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const dialogo = useRef<HTMLDialogElement>(null)
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(navigator.userAgent)

  useEffect(() => {
    const nodo = dialogo.current
    if (ayuda && !instalada) nodo?.showModal()
    else nodo?.close()
  }, [ayuda, instalada])

  useEffect(() => {
    function preparar(event: Event) {
      event.preventDefault()
      setEvento(event as EventoInstalacion)
    }

    function completar() {
      setEvento(null)
      setInstalada(true)
      setAyuda(false)
    }

    window.addEventListener("beforeinstallprompt", preparar)
    window.addEventListener("appinstalled", completar)
    const modo = window.matchMedia("(display-mode: standalone)")
    const actualizarModo = () => setInstalada(estaInstalada())
    modo.addEventListener("change", actualizarModo)

    return () => {
      window.removeEventListener("beforeinstallprompt", preparar)
      window.removeEventListener("appinstalled", completar)
      modo.removeEventListener("change", actualizarModo)
    }
  }, [])

  async function instalar() {
    if (!evento || procesando) return
    setProcesando(true)
    setMensaje("")
    try {
      await evento.prompt()
      const eleccion = await evento.userChoice
      if (eleccion.outcome === "accepted") setAyuda(false)
      else setMensaje("Puedes volver a instalar desde el menú del navegador.")
    } catch {
      setMensaje("Abre el menú del navegador y sigue los pasos de instalación.")
    } finally {
      setEvento(null)
      setProcesando(false)
    }
  }

  if (instalada) return null

  return (
    <div className="c1-instalacion">
      <button type="button" style={boton} onClick={() => setAyuda(true)}>
        <span style={icono} aria-hidden="true">↓</span>
        Instalar CIBUSPAN ONE
      </button>
      <dialog ref={dialogo} className="c1-instalacion-dialogo" onClose={() => setAyuda(false)}
        aria-labelledby="c1-instalar-titulo">
        <header>
          <img src={`${import.meta.env.BASE_URL}cibuspan-one-icon.png`} alt="" width={54} height={54} />
          <h2 id="c1-instalar-titulo">Instalar CIBUSPAN ONE</h2>
        </header>
        {evento ? <>
          <p>Agrega la aplicación a tu dispositivo para abrirla desde su ícono.</p>
          <button type="button" className="c1-instalar-confirmar" disabled={procesando} onClick={() => void instalar()}>
            {procesando ? "Abriendo instalación…" : "Instalar aplicación"}
          </button>
        </> : ios ? <>
          <p>En tu iPhone o iPad</p>
          <ol><li>Abre este enlace en Safari.</li><li>Pulsa <strong>Compartir</strong>.</li><li>Elige <strong>Añadir a pantalla de inicio</strong> y confirma <strong>Añadir</strong>.</li></ol>
        </> : android ? <>
          <p>En tu teléfono Android</p>
          <ol><li>Abre este enlace en Chrome.</li><li>Abre el menú de tres puntos.</li><li>Busca <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong> y confirma.</li></ol>
        </> : <>
          <p>En tu computadora</p>
          <ol><li>Abre este enlace en Chrome o Microsoft Edge.</li><li>Pulsa el ícono de instalación de la barra de direcciones o busca <strong>Instalar</strong> en el menú del navegador.</li><li>Confirma la instalación de CIBUSPAN ONE.</li></ol>
        </>}
        {!evento && <p>Si abriste el enlace dentro de WhatsApp, correo u otra aplicación, usa su menú para abrirlo en el navegador.</p>}
        {mensaje && <p role="status">{mensaje}</p>}
        <form method="dialog"><button type="submit">Cerrar</button></form>
      </dialog>
    </div>
  )
}

function estaInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
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
  background: "#051142",
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
  background: "#0de0cb",
  color: "#051142",
  fontSize: 16,
}
