import { useEffect } from "react"

export type TipoMensaje =
  | "EXITO"
  | "ERROR"
  | "ADVERTENCIA"
  | "INFORMACION"

type ModalMensajeProps = {
  abierto: boolean
  tipo: TipoMensaje
  titulo?: string
  mensaje: string
  textoBoton?: string
  cerrar: () => void
  cierreAutomaticoMs?: number
}

export default function ModalMensaje({
  abierto,
  tipo,
  titulo,
  mensaje,
  textoBoton,
  cerrar,
  cierreAutomaticoMs,
}: ModalMensajeProps) {
  useEffect(() => {
    if (!abierto) return

    function manejarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        cerrar()
      }
    }

    window.addEventListener("keydown", manejarTecla)

    return () => {
      window.removeEventListener(
        "keydown",
        manejarTecla,
      )
    }
  }, [abierto, cerrar])

  useEffect(() => {
    if (
      !abierto ||
      !cierreAutomaticoMs ||
      cierreAutomaticoMs <= 0
    ) {
      return
    }

    const temporizador = window.setTimeout(
      cerrar,
      cierreAutomaticoMs,
    )

    return () => {
      window.clearTimeout(temporizador)
    }
  }, [
    abierto,
    cierreAutomaticoMs,
    cerrar,
  ])

  if (!abierto) return null

  const configuracion = obtenerConfiguracion(tipo)

  return (
    <div
      style={fondo}
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) {
          cerrar()
        }
      }}
    >
      <section style={ventana}>
        <div
          style={{
            ...icono,
            background:
              configuracion.fondoIcono,
            color: configuracion.color,
          }}
        >
          {configuracion.simbolo}
        </div>

        <h2 style={tituloModal}>
          {titulo || configuracion.titulo}
        </h2>

        <p style={mensajeModal}>
          {mensaje}
        </p>

        <button
          type="button"
          onClick={cerrar}
          autoFocus
          style={{
            ...boton,
            background:
              configuracion.color,
          }}
        >
          {textoBoton ||
            configuracion.textoBoton}
        </button>
      </section>
    </div>
  )
}

function obtenerConfiguracion(
  tipo: TipoMensaje,
) {
  if (tipo === "EXITO") {
    return {
      simbolo: "✓",
      titulo: "Operación realizada",
      textoBoton: "Aceptar",
      color: "#15803d",
      fondoIcono: "#dcfce7",
    }
  }

  if (tipo === "ADVERTENCIA") {
    return {
      simbolo: "!",
      titulo: "Atención",
      textoBoton: "Entendido",
      color: "#b45309",
      fondoIcono: "#fef3c7",
    }
  }

  if (tipo === "INFORMACION") {
    return {
      simbolo: "i",
      titulo: "Información",
      textoBoton: "Aceptar",
      color: "#2563eb",
      fondoIcono: "#dbeafe",
    }
  }

  return {
    simbolo: "×",
    titulo: "No se pudo completar",
    textoBoton: "Entendido",
    color: "#b91c1c",
    fondoIcono: "#fee2e2",
  }
}

const fondo = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  background: "rgba(15, 23, 42, 0.58)",
  backdropFilter: "blur(2px)",
}

const ventana = {
  width: "min(430px, 92vw)",
  padding: "30px 26px 24px",
  borderRadius: "16px",
  background: "white",
  boxShadow:
    "0 24px 70px rgba(15, 23, 42, 0.30)",
  textAlign: "center" as const,
}

const icono = {
  width: "64px",
  height: "64px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 17px",
  borderRadius: "999px",
  fontSize: "38px",
  fontWeight: "bold",
  lineHeight: 1,
}

const tituloModal = {
  margin: "0 0 10px",
  color: "#111827",
  fontSize: "23px",
}

const mensajeModal = {
  margin: "0 auto 24px",
  color: "#4b5563",
  fontSize: "15px",
  lineHeight: 1.55,
  whiteSpace: "pre-line" as const,
}

const boton = {
  minWidth: "140px",
  minHeight: "44px",
  padding: "11px 20px",
  border: "none",
  borderRadius: "9px",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}