import { useRegisterSW } from "virtual:pwa-register/react"

export default function ActualizacionPwa() {
  const {
    needRefresh: [necesitaActualizar, setNecesitaActualizar],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      if (!registro) return

      window.setInterval(() => {
        void registro.update()
      }, 15 * 60 * 1000)
    },
  })

  if (!necesitaActualizar) return null

  return (
    <aside style={contenedor} role="status" aria-live="polite">
      <div>
        <strong style={titulo}>Nueva versión disponible</strong>
        <p style={detalle}>
          Guarda lo que estés llenando y actualiza para ver los últimos cambios.
        </p>
      </div>

      <div style={acciones}>
        <button
          type="button"
          onClick={() => setNecesitaActualizar(false)}
          style={botonDespues}
        >
          Más tarde
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          style={botonActualizar}
        >
          Actualizar ahora
        </button>
      </div>
    </aside>
  )
}

const contenedor = {
  position: "fixed" as const,
  right: "18px",
  bottom: "18px",
  zIndex: 10000,
  width: "min(430px, calc(100vw - 36px))",
  boxSizing: "border-box" as const,
  padding: "16px",
  border: "1px solid #f0d2ad",
  borderRadius: "14px",
  background: "#fffdf9",
  boxShadow: "0 16px 45px rgba(69, 34, 29, 0.2)",
  color: "#351d1d",
}

const titulo = {
  display: "block",
  color: "#8f1d24",
  fontSize: "16px",
}

const detalle = {
  margin: "5px 0 14px",
  color: "#6b625f",
  fontSize: "13px",
  lineHeight: 1.45,
}

const acciones = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "8px",
}

const botonDespues = {
  minHeight: "40px",
  padding: "9px 14px",
  border: "1px solid #d8cbc4",
  borderRadius: "8px",
  background: "white",
  color: "#6b625f",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonActualizar = {
  minHeight: "40px",
  padding: "9px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}
