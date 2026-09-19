import { useEffect, useMemo, useState } from "react"
import {
  ETIQUETAS_ROL,
  PANTALLAS_APLICACION,
  PERMISOS_PREDETERMINADOS,
  ROLES,
  actualizarUsuario,
  crearUsuario,
  guardarPermisosUsuario,
  listarUsuarios,
  restablecerPassword,
  type AppRole,
  type PantallaAplicacion,
  type RegistroAuditoria,
  type UsuarioAdministrable,
} from "../services/usuarioService"

const COLOR_VINO = "#8F1D24"
const COLOR_NARANJA = "#F7931E"

type Vista = "USUARIOS" | "AUDITORIA"

export default function UsuariosPermisos() {
  const [usuarios, setUsuarios] = useState<UsuarioAdministrable[]>([])
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([])
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>("USUARIOS")
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")
  const [mostrarCreacion, setMostrarCreacion] = useState(false)

  const seleccionado = useMemo(
    () => usuarios.find((usuario) => usuario.user_id === seleccionadoId) ?? null,
    [usuarios, seleccionadoId],
  )

  async function cargar() {
    setCargando(true)
    setError("")
    try {
      const data = await listarUsuarios()
      setUsuarios(data.usuarios)
      setAuditoria(data.auditoria)
      setSeleccionadoId((actual) =>
        actual && data.usuarios.some((usuario) => usuario.user_id === actual)
          ? actual
          : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios.")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
  }, [])

  function confirmar(texto: string) {
    setMensaje(texto)
    window.setTimeout(() => setMensaje(""), 4200)
  }

  return (
    <div style={pagina}>
      <header style={encabezado}>
        <div>
          <span style={sobreTitulo}>ADMINISTRACIÓN DEL SISTEMA</span>
          <h1 style={titulo}>Usuarios y permisos</h1>
          <p style={subtitulo}>
            Crea usuarios, asigna roles, personaliza accesos y revisa el historial de cambios.
          </p>
        </div>
        {vista === "USUARIOS" && (
          <button style={botonPrimario} onClick={() => setMostrarCreacion(true)}>
            + Nuevo usuario
          </button>
        )}
      </header>

      <div style={pestanas}>
        <Pestana activa={vista === "USUARIOS"} onClick={() => setVista("USUARIOS")}>
          Usuarios
        </Pestana>
        <Pestana activa={vista === "AUDITORIA"} onClick={() => setVista("AUDITORIA")}>
          Registro de auditoría
        </Pestana>
      </div>

      {mensaje && <div style={avisoExito}>{mensaje}</div>}
      {error && <div style={avisoError}>{error}</div>}

      {cargando ? (
        <div style={estado}>Cargando usuarios y permisos...</div>
      ) : vista === "USUARIOS" ? (
        <section style={tarjeta}>
          <div style={cabeceraTabla}>
            <span>{usuarios.length} usuario{usuarios.length === 1 ? "" : "s"}</span>
            <button style={botonSecundario} onClick={() => void cargar()}>
              Actualizar
            </button>
          </div>

          <div style={tablaContenedor}>
            <table style={tabla}>
              <thead>
                <tr>
                  <th style={th}>Usuario</th>
                  <th style={th}>Rol</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Último acceso</th>
                  <th style={{ ...th, textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.user_id}>
                    <td style={td}>
                      <strong style={{ display: "block" }}>{usuario.nombre || "Sin nombre"}</strong>
                      <small style={textoSuave}>{usuario.email}</small>
                    </td>
                    <td style={td}>{ETIQUETAS_ROL[usuario.rol]}</td>
                    <td style={td}>
                      <span style={usuario.activo ? estadoActivo : estadoInactivo}>
                        {usuario.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={td}>{formatearFecha(usuario.ultimo_acceso)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button style={botonEnlace} onClick={() => setSeleccionadoId(usuario.user_id)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <Auditoria registros={auditoria} />
      )}

      {mostrarCreacion && (
        <Modal titulo="Crear nuevo usuario" cerrar={() => setMostrarCreacion(false)}>
          <FormularioCreacion
            guardando={guardando}
            guardar={async (datos) => {
              setGuardando(true)
              setError("")
              try {
                await crearUsuario(datos)
                setMostrarCreacion(false)
                confirmar("Usuario creado correctamente.")
                await cargar()
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo crear el usuario.")
              } finally {
                setGuardando(false)
              }
            }}
          />
        </Modal>
      )}

      {seleccionado && (
        <Modal titulo="Editar usuario y permisos" cerrar={() => setSeleccionadoId(null)} ancho={820}>
          <EditorUsuario
            key={`${seleccionado.user_id}-${seleccionado.actualizado_en}`}
            usuario={seleccionado}
            guardando={guardando}
            onError={setError}
            onConfirmar={confirmar}
            onGuardando={setGuardando}
            recargar={cargar}
          />
        </Modal>
      )}
    </div>
  )
}

function FormularioCreacion({
  guardar,
  guardando,
}: {
  guardar: (datos: { email: string; nombre: string; rol: AppRole; password: string }) => void
  guardando: boolean
}) {
  const [nombre, setNombre] = useState("")
  const [email, setEmail] = useState("")
  const [rol, setRol] = useState<AppRole>("BODEGUERO")
  const [password, setPassword] = useState("")

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        guardar({ nombre, email, rol, password })
      }}
      style={formulario}
    >
      <Campo etiqueta="Nombre completo">
        <input style={input} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Correo electrónico">
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Rol">
        <select style={input} value={rol} onChange={(e) => setRol(e.target.value as AppRole)}>
          {ROLES.map((item) => <option key={item} value={item}>{ETIQUETAS_ROL[item]}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Contraseña temporal">
        <input style={input} type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <small style={textoSuave}>Mínimo 8 caracteres. Entrégala al usuario por un medio seguro.</small>
      </Campo>
      <button style={botonPrimario} disabled={guardando}>
        {guardando ? "Creando..." : "Crear usuario"}
      </button>
    </form>
  )
}

function EditorUsuario({
  usuario,
  guardando,
  onError,
  onConfirmar,
  onGuardando,
  recargar,
}: {
  usuario: UsuarioAdministrable
  guardando: boolean
  onError: (mensaje: string) => void
  onConfirmar: (mensaje: string) => void
  onGuardando: (estado: boolean) => void
  recargar: () => Promise<void>
}) {
  const [nombre, setNombre] = useState(usuario.nombre ?? "")
  const [rol, setRol] = useState<AppRole>(usuario.rol)
  const [activo, setActivo] = useState(usuario.activo)
  const [password, setPassword] = useState("")
  const permisosIniciales = useMemo(() => {
    const porDefecto = new Set(PERMISOS_PREDETERMINADOS[usuario.rol])
    for (const permiso of usuario.permisos_personalizados) {
      if (permiso.permitido) porDefecto.add(permiso.pantalla)
      else porDefecto.delete(permiso.pantalla)
    }
    return porDefecto
  }, [usuario])
  const [permisos, setPermisos] = useState<Set<PantallaAplicacion>>(permisosIniciales)

  function alternar(pantalla: PantallaAplicacion) {
    setPermisos((actuales) => {
      const copia = new Set(actuales)
      if (copia.has(pantalla)) copia.delete(pantalla)
      else copia.add(pantalla)
      return copia
    })
  }

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    onGuardando(true)
    onError("")
    try {
      await accion()
      onConfirmar(exito)
      await recargar()
    } catch (err) {
      onError(err instanceof Error ? err.message : "No fue posible guardar los cambios.")
    } finally {
      onGuardando(false)
    }
  }

  return (
    <div style={formulario}>
      <div style={dosColumnas}>
        <Campo etiqueta="Nombre completo">
          <input style={input} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Correo">
          <input style={{ ...input, background: "#f3f4f6" }} value={usuario.email} disabled />
        </Campo>
        <Campo etiqueta="Rol">
          <select
            style={input}
            value={rol}
            onChange={(e) => {
              const nuevoRol = e.target.value as AppRole
              setRol(nuevoRol)
              setPermisos(new Set(PERMISOS_PREDETERMINADOS[nuevoRol]))
            }}
          >
            {ROLES.map((item) => <option key={item} value={item}>{ETIQUETAS_ROL[item]}</option>)}
          </select>
        </Campo>
        <label style={interruptorFila}>
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span>Usuario activo</span>
        </label>
      </div>

      <button
        style={botonPrimario}
        disabled={guardando}
        onClick={() => void ejecutar(
          () => actualizarUsuario({ userId: usuario.user_id, nombre, rol, activo }),
          "Datos del usuario actualizados.",
        )}
      >
        Guardar datos generales
      </button>

      <div style={separador} />
      <div>
        <h3 style={subtituloSeccion}>Acceso por módulo</h3>
        <p style={textoSuave}>Puedes ajustar estos permisos exclusivamente para este usuario.</p>
      </div>
      <div style={permisosGrid}>
        {PANTALLAS_APLICACION.map((pantalla) => (
          <label key={pantalla} style={permisoItem}>
            <input
              type="checkbox"
              checked={pantalla === "Usuarios y permisos"
                ? rol === "ADMINISTRADOR"
                : permisos.has(pantalla)}
              disabled={pantalla === "Usuarios y permisos"}
              onChange={() => alternar(pantalla)}
            />
            <span>{pantalla}</span>
          </label>
        ))}
      </div>
      <div style={accionesFila}>
        <button
          style={botonSecundario}
          disabled={guardando}
          onClick={() => {
            setPermisos(new Set(PERMISOS_PREDETERMINADOS[rol]))
            void ejecutar(
              () => guardarPermisosUsuario(usuario.user_id, []),
              "Se restauraron los permisos predeterminados del rol.",
            )
          }}
        >
          Restaurar permisos del rol
        </button>
        <button
          style={botonPrimario}
          disabled={guardando}
          onClick={() => void ejecutar(
            () => guardarPermisosUsuario(
              usuario.user_id,
              PANTALLAS_APLICACION.map((pantalla) => ({
                pantalla,
                permitido: pantalla === "Usuarios y permisos"
                  ? rol === "ADMINISTRADOR"
                  : permisos.has(pantalla),
              })),
            ),
            "Permisos personalizados guardados.",
          )}
        >
          Guardar permisos
        </button>
      </div>

      <div style={separador} />
      <h3 style={subtituloSeccion}>Restablecer contraseña</h3>
      <div style={accionesFila}>
        <input
          style={{ ...input, flex: 1 }}
          type="password"
          minLength={8}
          placeholder="Nueva contraseña temporal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          style={botonAdvertencia}
          disabled={guardando || password.length < 8}
          onClick={() => void ejecutar(
            () => restablecerPassword(usuario.user_id, password),
            "Contraseña restablecida correctamente.",
          )}
        >
          Cambiar contraseña
        </button>
      </div>
    </div>
  )
}

function Auditoria({ registros }: { registros: RegistroAuditoria[] }) {
  return (
    <section style={tarjeta}>
      <div style={cabeceraTabla}>Últimos {registros.length} cambios administrativos</div>
      <div style={tablaContenedor}>
        <table style={tabla}>
          <thead><tr><th style={th}>Fecha</th><th style={th}>Administrador</th><th style={th}>Acción</th><th style={th}>Usuario afectado</th></tr></thead>
          <tbody>
            {registros.map((item) => (
              <tr key={item.id}>
                <td style={td}>{formatearFecha(item.creado_en)}</td>
                <td style={td}>{item.actor_email || "Sistema"}</td>
                <td style={td}>{item.accion.replaceAll("_", " ")}</td>
                <td style={td}>{item.target_email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Modal({ titulo, cerrar, children, ancho = 620 }: { titulo: string; cerrar: () => void; children: React.ReactNode; ancho?: number }) {
  return (
    <div style={overlay} onMouseDown={cerrar}>
      <section style={{ ...modal, maxWidth: ancho }} onMouseDown={(e) => e.stopPropagation()}>
        <header style={modalHeader}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{titulo}</h2>
          <button style={botonCerrar} onClick={cerrar} aria-label="Cerrar">×</button>
        </header>
        {children}
      </section>
    </div>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return <label style={campo}><span style={etiquetaCampo}>{etiqueta}</span>{children}</label>
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ ...pestana, ...(activa ? pestanaActiva : {}) }}>{children}</button>
}

function formatearFecha(fecha?: string | null) {
  if (!fecha) return "Nunca"
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fecha))
}

const pagina: React.CSSProperties = { padding: "clamp(18px, 3vw, 36px)", color: "#1f2937", minHeight: "100%" }
const encabezado: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap", marginBottom: 22 }
const sobreTitulo: React.CSSProperties = { color: COLOR_NARANJA, fontSize: 12, fontWeight: 800, letterSpacing: 1.4 }
const titulo: React.CSSProperties = { margin: "5px 0 4px", fontSize: "clamp(27px, 4vw, 40px)", color: "#24191a" }
const subtitulo: React.CSSProperties = { margin: 0, color: "#6b7280", maxWidth: 720 }
const pestanas: React.CSSProperties = { display: "flex", gap: 8, borderBottom: "1px solid #e5e7eb", marginBottom: 22 }
const pestana: React.CSSProperties = { border: 0, borderBottom: "3px solid transparent", background: "transparent", padding: "11px 14px", color: "#6b7280", fontWeight: 700, cursor: "pointer" }
const pestanaActiva: React.CSSProperties = { color: COLOR_VINO, borderBottomColor: COLOR_VINO }
const tarjeta: React.CSSProperties = { background: "white", border: "1px solid #e5e7eb", borderRadius: 16, boxShadow: "0 12px 32px rgba(60, 34, 36, .06)", overflow: "hidden" }
const cabeceraTabla: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 20px", fontWeight: 750, borderBottom: "1px solid #e5e7eb" }
const tablaContenedor: React.CSSProperties = { overflowX: "auto" }
const tabla: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 720 }
const th: React.CSSProperties = { padding: "12px 20px", background: "#faf8f6", color: "#6b7280", textAlign: "left", fontSize: 12, textTransform: "uppercase", letterSpacing: .6 }
const td: React.CSSProperties = { padding: "14px 20px", borderTop: "1px solid #f0f1f2", verticalAlign: "middle" }
const textoSuave: React.CSSProperties = { color: "#6b7280" }
const estadoActivo: React.CSSProperties = { color: "#166534", background: "#dcfce7", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 750 }
const estadoInactivo: React.CSSProperties = { color: "#991b1b", background: "#fee2e2", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 750 }
const botonPrimario: React.CSSProperties = { border: 0, borderRadius: 9, padding: "11px 16px", background: COLOR_VINO, color: "white", fontWeight: 750, cursor: "pointer" }
const botonSecundario: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 9, padding: "9px 13px", background: "white", color: "#374151", fontWeight: 700, cursor: "pointer" }
const botonAdvertencia: React.CSSProperties = { ...botonSecundario, borderColor: "#f59e0b", color: "#92400e" }
const botonEnlace: React.CSSProperties = { border: 0, background: "transparent", color: COLOR_VINO, fontWeight: 800, cursor: "pointer" }
const avisoExito: React.CSSProperties = { padding: 13, borderRadius: 10, marginBottom: 14, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" }
const avisoError: React.CSSProperties = { padding: 13, borderRadius: 10, marginBottom: 14, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }
const estado: React.CSSProperties = { ...tarjeta, padding: 32, textAlign: "center", color: "#6b7280" }
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 3000, background: "rgba(31, 18, 19, .58)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }
const modal: React.CSSProperties = { width: "100%", maxHeight: "90vh", overflowY: "auto", borderRadius: 16, background: "white", padding: 22, boxShadow: "0 24px 70px rgba(0,0,0,.28)" }
const modalHeader: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }
const botonCerrar: React.CSSProperties = { border: 0, background: "#f3f4f6", borderRadius: 999, width: 36, height: 36, fontSize: 24, cursor: "pointer" }
const formulario: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 16 }
const campo: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 7 }
const etiquetaCampo: React.CSSProperties = { fontSize: 13, fontWeight: 750, color: "#374151" }
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", border: "1px solid #d1d5db", borderRadius: 9, padding: "10px 12px", font: "inherit", color: "#1f2937", background: "white" }
const dosColumnas: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }
const interruptorFila: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, fontWeight: 700, minHeight: 42 }
const separador: React.CSSProperties = { height: 1, background: "#e5e7eb", margin: "4px 0" }
const subtituloSeccion: React.CSSProperties = { margin: "0 0 4px", color: "#2b2021" }
const permisosGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 9 }
const permisoItem: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 9, background: "#fafafa" }
const accionesFila: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }
