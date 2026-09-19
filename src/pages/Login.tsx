import { useState } from "react"
import { supabase } from "../lib/supabase"

export default function Login() {
  const [correo, setCorreo] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [cargando, setCargando] = useState(false)

  async function iniciarSesion(
    evento: React.FormEvent<HTMLFormElement>,
  ) {
    evento.preventDefault()
    setMensaje("")
    setCargando(true)

    const { error } =
      await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: contrasena,
      })

    if (error) {
  console.error(error)

  setMensaje(error.message)

  setCargando(false)
  return
}

    setCargando(false)
  }

  return (
    <main style={pagina}>
      <section style={tarjeta}>
        <div style={marca}>
          <div style={icono}>C1</div>

          <h1 style={titulo}>
            CIBUSPAN ONE
          </h1>

          <p style={subtitulo}>
            Sistema Integral de Producción
          </p>
        </div>

        <form
          onSubmit={iniciarSesion}
          style={formulario}
        >
          <div>
            <label>Correo electrónico</label>

            <input
              type="email"
              value={correo}
              onChange={(evento) =>
                setCorreo(evento.target.value)
              }
              required
              autoComplete="email"
              style={campo}
            />
          </div>

          <div>
            <label>Contraseña</label>

            <input
              type="password"
              value={contrasena}
              onChange={(evento) =>
                setContrasena(
                  evento.target.value,
                )
              }
              required
              autoComplete="current-password"
              style={campo}
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            style={{
              ...boton,
              opacity: cargando ? 0.6 : 1,
              cursor: cargando
                ? "not-allowed"
                : "pointer",
            }}
          >
            {cargando
              ? "Ingresando..."
              : "Ingresar"}
          </button>

          {mensaje && (
            <p style={error}>{mensaje}</p>
          )}
        </form>
      </section>
    </main>
  )
}

const pagina = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "#f4f4f4",
}

const tarjeta = {
  width: "100%",
  maxWidth: "420px",
  padding: "34px",
  borderRadius: "16px",
  background: "white",
  boxShadow:
    "0 18px 45px rgba(0, 0, 0, 0.12)",
}

const marca = {
  textAlign: "center" as const,
  marginBottom: "28px",
}

const icono = {
  width: "58px",
  height: "58px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 14px",
  borderRadius: "14px",
  background: "#8f1d24",
  color: "white",
  fontSize: "20px",
  fontWeight: "bold",
}

const titulo = {
  margin: 0,
  fontSize: "28px",
}

const subtitulo = {
  margin: "8px 0 0",
  color: "#6b7280",
}

const formulario = {
  display: "grid",
  gap: "18px",
}

const campo = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "12px",
  marginTop: "7px",
  border: "1px solid #cccccc",
  borderRadius: "8px",
}

const boton = {
  padding: "13px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
}

const error = {
  margin: 0,
  padding: "12px",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
}