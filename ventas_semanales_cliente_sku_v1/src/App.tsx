import { useEffect, useRef, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "./lib/supabase"

import Layout from "./components/layout/Layout"
import InstalarApp from "./components/InstalarApp"
import Login from "./pages/Login"
import DashboardV2 from "./pages/DashboardV2"
import PedidosV2 from "./pages/PedidosV2"
import InventarioV2 from "./pages/InventarioV2"
import ProduccionV2 from "./pages/ProduccionV2"
import DespachosV2 from "./pages/DespachosV2"
import HistorialDespachos from "./pages/HistorialDespachos"
import Devoluciones from "./pages/Devoluciones"
import Reportes from "./pages/Reportes"
import Documentos from "./pages/Documentos"
import AnexoSupermaxi from "./pages/AnexoSupermaxi.tsx"
import ImprimirAnexoSupermaxi from "./pages/ImprimirAnexoSupermaxi"
import Administracion from "./pages/Administracion"
import HojaProduccion from "./pages/HojaProduccion"
import HojaDespacho from "./pages/HojaDespacho"
import EtiquetadoSemielaborados from "./pages/EtiquetadoSemielaborados"
import MateriasPrimas from "./pages/MateriasPrimas"
import Formulas from "./pages/Formulas"
import CostosIndirectos from "./pages/CostosIndirectos"
import VentasClienteSku from "./pages/VentasClienteSku"
import UsuariosPermisos from "./pages/UsuariosPermisos"
import {
  ETIQUETAS_ROL,
  obtenerAccesoActual,
  type PerfilAplicacion,
} from "./services/usuarioService"

const PANTALLAS_HIJAS: Record<string, string> = {
  "Historial despachos": "Despachos",
  "Hoja de producción": "Documentos",
  "Hoja de despacho": "Documentos",
  "Anexo Supermaxi": "Documentos",
  "Costos indirectos": "Administración",
  "Ventas por cliente y SKU": "Reportes",
}

function puedeAbrir(pantallas: string[], destino: string) {
  if (pantallas.includes(destino)) return true
  const pantallaPadre = PANTALLAS_HIJAS[destino]
  return Boolean(pantallaPadre && pantallas.includes(pantallaPadre))
}

function App() {
  const [sesion, setSesion] = useState<Session | null>(
    null,
  )

  const [cargandoSesion, setCargandoSesion] =
    useState(true)

  const [cargandoAcceso, setCargandoAcceso] =
    useState(false)

  const [perfil, setPerfil] =
    useState<PerfilAplicacion | null>(null)

  const [pantallasPermitidas, setPantallasPermitidas] =
    useState<string[]>([])

  const [errorAcceso, setErrorAcceso] =
    useState("")

  const [pantalla, setPantalla] =
    useState("Dashboard")

  const historialPantallasRef = useRef<string[]>([])

  const parametros = new URLSearchParams(
    window.location.search,
  )

  const modo = parametros.get("modo")

  useEffect(() => {
    async function revisarSesion() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSesion(session)
      setCargandoSesion(false)
    }

    revisarSesion()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_evento, session) => {
        setSesion(session)
        setCargandoSesion(false)
      },
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sesion) {
      setPerfil(null)
      setPantallasPermitidas([])
      setErrorAcceso("")
      return
    }

    let vigente = true
    setCargandoAcceso(true)
    setErrorAcceso("")

    obtenerAccesoActual(sesion.user.id)
      .then(({ perfil: perfilCargado, pantallasPermitidas: pantallas }) => {
        if (!vigente) return
        setPerfil(perfilCargado)
        setPantallasPermitidas(pantallas)
      })
      .catch((error) => {
        if (!vigente) return
        setErrorAcceso(
          error instanceof Error
            ? error.message
            : "No fue posible cargar los permisos.",
        )
      })
      .finally(() => {
        if (vigente) setCargandoAcceso(false)
      })

    return () => {
      vigente = false
    }
  }, [sesion])

  function tieneAcceso(destino: string) {
    return puedeAbrir(pantallasPermitidas, destino)
  }

  function cambiarPantalla(destino: string) {
    setPantalla((actual) => {
      if (actual === destino) return actual

      historialPantallasRef.current = [
        ...historialPantallasRef.current,
        actual,
      ].slice(-50)

      return destino
    })
  }

  function regresarPantalla() {
    let destinoAnterior: string | undefined

    while (historialPantallasRef.current.length > 0) {
      const candidato = historialPantallasRef.current.pop()

      if (candidato && tieneAcceso(candidato)) {
        destinoAnterior = candidato
        break
      }
    }

    if (destinoAnterior) {
      setPantalla(destinoAnterior)
    }
  }

  useEffect(() => {
    if (cargandoAcceso || errorAcceso || pantallasPermitidas.length === 0) return
    if (puedeAbrir(pantallasPermitidas, pantalla)) return

    const prioridad = [
      "Dashboard",
      "Pedidos",
      "Inventario",
      "Producción",
      "Despachos",
      "Reportes",
      "Documentos",
      "Devoluciones",
    ]
    const destino = prioridad.find((item) => puedeAbrir(pantallasPermitidas, item))
      ?? pantallasPermitidas[0]
    setPantalla(destino)
  }, [cargandoAcceso, errorAcceso, pantalla, pantallasPermitidas])

  async function cerrarSesion() {
    await supabase.auth.signOut({
      scope: "local",
    })

    setPantalla("Dashboard")
    historialPantallasRef.current = []
  }

  if (
    cargandoSesion ||
    (sesion && !errorAcceso && (cargandoAcceso || !perfil))
  ) {
    return (
      <main style={paginaCarga}>
        <div style={cargador}>
          <div style={iconoCarga}>C1</div>

          <h1 style={{ margin: 0 }}>
            CIBUSPAN ONE
          </h1>

          <p
            style={{
              margin: 0,
              color: "#6b7280",
            }}
          >
            {cargandoSesion ? "Verificando sesión..." : "Cargando permisos..."}
          </p>
        </div>
      </main>
    )
  }

  if (!sesion) {
    return <Login />
  }

  if (errorAcceso) {
    return (
      <main style={paginaCarga}>
        <section style={tarjetaConfiguracion}>
          <div style={iconoCarga}>C1</div>
          <h1 style={{ margin: 0 }}>Configuración pendiente</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>{errorAcceso}</p>
          <p style={{ margin: 0, color: "#6b7280" }}>
            Ejecuta la migración incluida en la carpeta supabase y vuelve a ingresar.
          </p>
          <button type="button" style={botonCerrarSesion} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </section>
      </main>
    )
  }

  if (!perfil?.activo) {
    return (
      <main style={paginaCarga}>
        <section style={tarjetaConfiguracion}>
          <h1 style={{ margin: 0 }}>Usuario inactivo</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            Solicita al administrador que reactive tu acceso.
          </p>
          <button type="button" style={botonCerrarSesion} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </section>
      </main>
    )
  }

  if (modo === "imprimir-anexo-supermaxi") {
    return tieneAcceso("Anexo Supermaxi")
      ? <ImprimirAnexoSupermaxi />
      : <AccesoDenegado cerrarSesion={cerrarSesion} />
  }

  return (
    <Layout
      pantalla={pantalla}
      cambiarPantalla={cambiarPantalla}
      regresar={regresarPantalla}
      puedeRegresar={historialPantallasRef.current.some(
        (destino) => tieneAcceso(destino),
      )}
      cerrarSesion={cerrarSesion}
      usuario={sesion.user.email}
      nombreUsuario={perfil.nombre}
      rolUsuario={ETIQUETAS_ROL[perfil.rol]}
      pantallasPermitidas={pantallasPermitidas}
    >
        {pantalla === "Dashboard" && tieneAcceso(pantalla) && (
          <DashboardV2 />
        )}

        {pantalla === "Pedidos" && tieneAcceso(pantalla) && (
          <PedidosV2 />
        )}

        {pantalla === "Inventario" && tieneAcceso(pantalla) && (
          <InventarioV2 />
        )}

        {pantalla === "Producción" && tieneAcceso(pantalla) && (
          <ProduccionV2 />
        )}

        {pantalla === "Semielaborados" && tieneAcceso(pantalla) && (
          <EtiquetadoSemielaborados />
        )}

        {pantalla === "Despachos" && tieneAcceso(pantalla) && (
          <DespachosV2 />
        )}

        {pantalla === "Historial despachos" && tieneAcceso(pantalla) && (
          <HistorialDespachos />
        )}

        {pantalla === "Devoluciones" && tieneAcceso(pantalla) && (
          <Devoluciones />
        )}

        {pantalla === "Reportes" && tieneAcceso(pantalla) && (
          <Reportes cambiarPantalla={cambiarPantalla} />
        )}

        {pantalla === "Ventas por cliente y SKU" && tieneAcceso(pantalla) && (
          <VentasClienteSku />
        )}

        {pantalla === "Documentos" && tieneAcceso(pantalla) && (
          <Documentos
            cambiarPantalla={cambiarPantalla}
          />
        )}

        {pantalla === "Hoja de producción" && tieneAcceso(pantalla) && (
          <HojaProduccion />
        )}

        {pantalla === "Hoja de despacho" && tieneAcceso(pantalla) && (
          <HojaDespacho />
        )}

        {pantalla === "Anexo Supermaxi" && tieneAcceso(pantalla) && (
          <AnexoSupermaxi />
        )}

        {pantalla === "Administración" && tieneAcceso(pantalla) && (
          <Administracion
            cambiarPantalla={cambiarPantalla}
            puedeGestionarUsuarios={tieneAcceso("Usuarios y permisos")}
          />
        )}

        {pantalla === "Materias primas" && tieneAcceso(pantalla) && (
          <MateriasPrimas />
        )}

        {pantalla === "Preformulación" && tieneAcceso(pantalla) && (
          <Formulas />
        )}

        {pantalla === "Costos indirectos" && tieneAcceso(pantalla) && (
          <CostosIndirectos />
        )}

        {pantalla === "Usuarios y permisos" && tieneAcceso(pantalla) && (
          <UsuariosPermisos />
        )}

        {!tieneAcceso(pantalla) && (
          <AccesoDenegado />
        )}

        {pantalla !== "Dashboard" &&
          pantalla !== "Pedidos" &&
          pantalla !== "Inventario" &&
          pantalla !== "Producción" &&
          pantalla !== "Semielaborados" &&
          pantalla !== "Despachos" &&
          pantalla !== "Historial despachos" &&
          pantalla !== "Devoluciones" &&
          pantalla !== "Reportes" &&
          pantalla !== "Ventas por cliente y SKU" &&
          pantalla !== "Documentos" &&
          pantalla !== "Hoja de producción" &&
          pantalla !== "Hoja de despacho" &&
          pantalla !== "Anexo Supermaxi" &&
          pantalla !== "Administración" &&
          pantalla !== "Materias primas" &&
          pantalla !== "Preformulación" &&
          pantalla !== "Costos indirectos" &&
          pantalla !== "Usuarios y permisos" && (
            <section style={{ padding: 20 }}>
              <h1>{pantalla}</h1>
              <p>Módulo en construcción...</p>
            </section>
          )}
        <InstalarApp />
    </Layout>
  )
}

const paginaCarga = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "#f8f5f1",
}

const cargador = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: "14px",
}

const iconoCarga = {
  width: "58px",
  height: "58px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "14px",
  background: "#8F1D24",
  color: "white",
  fontWeight: "bold",
  fontSize: "20px",
}

const botonCerrarSesion = {
  padding: "9px 14px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  background: "white",
  color: "#8f1d24",
  fontWeight: "bold",
  cursor: "pointer",
}

const tarjetaConfiguracion = {
  width: "min(520px, 100%)",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  textAlign: "center" as const,
  gap: "14px",
  padding: "30px",
  borderRadius: "16px",
  border: "1px solid #e5e7eb",
  background: "white",
  boxShadow: "0 18px 50px rgba(60, 34, 36, .08)",
}

function AccesoDenegado({ cerrarSesion }: { cerrarSesion?: () => void | Promise<void> }) {
  return (
    <section style={{ ...tarjetaConfiguracion, margin: "40px auto" }}>
      <h1 style={{ margin: 0 }}>Acceso restringido</h1>
      <p style={{ margin: 0, color: "#6b7280" }}>
        Tu usuario no tiene permiso para abrir este módulo.
      </p>
      {cerrarSesion && (
        <button type="button" style={botonCerrarSesion} onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      )}
    </section>
  )
}

export default App
