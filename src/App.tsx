import { lazy, Suspense, useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"

import { supabase } from "./lib/supabase"

import Layout from "./components/layout/Layout"
import Login from "./pages/Login"
import InstalarApp from "./components/InstalarApp"
import { obtenerAccesoActual, type PerfilAplicacion } from "./services/usuarioService"

// V12.11: cada módulo se descarga solo cuando el usuario lo abre.
// Esto reduce mucho el JavaScript inicial de la app y evita cargar importadores,
// PDF/Excel y pantallas pesadas que no se están usando.
const DashboardV2 = lazy(() => import("./pages/DashboardV2"))
const PedidosV2 = lazy(() => import("./pages/PedidosV2"))
const InventarioV2 = lazy(() => import("./pages/InventarioV2"))
const ProduccionV2 = lazy(() => import("./pages/ProduccionV2"))
const DespachosV2 = lazy(() => import("./pages/DespachosV2"))
const HistorialDespachos = lazy(() => import("./pages/HistorialDespachos"))
const Devoluciones = lazy(() => import("./pages/Devoluciones"))
const Reportes = lazy(() => import("./pages/Reportes"))
const Documentos = lazy(() => import("./pages/Documentos"))
const AnexoSupermaxi = lazy(() => import("./pages/AnexoSupermaxi"))
const ImprimirAnexoSupermaxi = lazy(() => import("./pages/ImprimirAnexoSupermaxi"))
const Administracion = lazy(() => import("./pages/Administracion"))
const HojaProduccion = lazy(() => import("./pages/HojaProduccion"))
const HojaDespacho = lazy(() => import("./pages/HojaDespacho"))
const EtiquetadoSemielaborados = lazy(() => import("./pages/EtiquetadoSemielaborados"))
const MateriasPrimas = lazy(() => import("./pages/MateriasPrimas"))
const Formulas = lazy(() => import("./pages/Formulas"))
const ComercialClientes = lazy(() => import("./pages/ComercialClientes"))
const CostosIndirectos = lazy(() => import("./pages/CostosIndirectos"))
const RentabilidadComercial = lazy(() => import("./pages/RentabilidadComercial"))
const VentasClienteSku = lazy(() => import("./pages/VentasClienteSku"))
const PagosGastos = lazy(() => import("./pages/PagosGastos"))
const RolesPago = lazy(() => import("./pages/RolesPago"))
const ReporteDevoluciones = lazy(() => import("./pages/ReporteDevoluciones"))
const DescuentosPromociones = lazy(() => import("./pages/DescuentosPromociones"))
const ReporteRentabilidadSku = lazy(() => import("./pages/ReporteRentabilidadSku"))
const SimuladorRentabilidad = lazy(() => import("./pages/SimuladorRentabilidad"))
const UsuariosPermisos = lazy(() => import("./pages/UsuariosPermisos"))
const ClasificacionGastos = lazy(() => import("./pages/ClasificacionGastos"))
const ImportacionContable = lazy(() => import("./pages/ImportacionContable"))
const KpiKam = lazy(() => import("./pages/KpiKam"))
const CampoComercialMovil = lazy(() => import("./pages/CampoComercialMovil"))

function PantallaEnConstruccion({
  titulo,
  detalle,
}: {
  titulo: string
  detalle?: string
}) {
  return (
    <section
      style={{
        padding: "28px",
        maxWidth: "1180px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          border: "1px solid #eadfd8",
          borderRadius: "16px",
          background: "white",
          padding: "24px",
          boxShadow: "0 8px 28px rgba(73, 45, 35, 0.06)",
        }}
      >
        <p
          style={{
            margin: "0 0 6px",
            color: "#F7931E",
            fontSize: "12px",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          CIBUSPAN ONE · Navegación V2
        </p>
        <h1 style={{ margin: "0 0 10px", color: "#8F1D24" }}>{titulo}</h1>
        <p style={{ margin: 0, color: "#6b625f", lineHeight: 1.55 }}>
          {detalle ??
            "La ubicación ya quedó creada dentro de la nueva arquitectura. La función se integrará en las siguientes fases sin afectar los módulos actuales."}
        </p>
      </div>
    </section>
  )
}

function App() {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [perfil, setPerfil] = useState<PerfilAplicacion | null>(null)
  const [cargandoPerfil, setCargandoPerfil] = useState(true)
  const [pantalla, setPantalla] = useState("Dashboard")

  const parametros = new URLSearchParams(window.location.search)
  const modo = parametros.get("modo")

  useEffect(() => {
    async function revisarSesion() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      setSesion(session)
      if (session?.user.id) {
        try {
          const acceso = await obtenerAccesoActual(session.user.id)
          setPerfil(acceso.perfil)
        } catch {
          setPerfil(null)
        }
      }
      setCargandoPerfil(false)
      setCargandoSesion(false)
    }

    revisarSesion()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, session) => {
      setSesion(session)
      if (!session) {
        setPerfil(null)
        setCargandoPerfil(false)
      } else {
        setCargandoPerfil(true)
        window.setTimeout(() => {
          void obtenerAccesoActual(session.user.id)
            .then((acceso) => setPerfil(acceso.perfil))
            .catch(() => setPerfil(null))
            .finally(() => setCargandoPerfil(false))
        }, 0)
      }
      setCargandoSesion(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut({
      scope: "local",
    })

    setPantalla("Dashboard")
  }

  if (cargandoSesion || cargandoPerfil) {
    return (
      <main style={paginaCarga}>
        <div style={cargador}>
          <div style={iconoCarga}>C1</div>

          <h1 style={{ margin: 0 }}>CIBUSPAN ONE</h1>

          <p
            style={{
              margin: 0,
              color: "#6b7280",
            }}
          >
            Verificando sesión...
          </p>
        </div>
      </main>
    )
  }

  if (!sesion) {
    return <Login />
  }

  if (perfil?.rol === "MERCADERISTA") {
    return (
      <Suspense fallback={<CargandoModulo />}>
        <CampoComercialMovil usuario={sesion.user.email} cerrarSesion={cerrarSesion} />
      </Suspense>
    )
  }

  if (modo === "imprimir-anexo-supermaxi") {
    return (
      <Suspense fallback={<CargandoModulo />}>
        <ImprimirAnexoSupermaxi />
      </Suspense>
    )
  }

  function renderPantalla() {
    switch (pantalla) {
      // ---------------------------------------------------------
      // INICIO
      // ---------------------------------------------------------
      case "Dashboard":
        return <DashboardV2 cambiarPantalla={setPantalla} />

      // ---------------------------------------------------------
      // COMERCIAL
      // ---------------------------------------------------------
      case "Comercial · Pedidos":
      case "Pedidos":
        return <PedidosV2 />

      case "Comercial · Devoluciones":
      case "Devoluciones":
        return <Devoluciones />

      case "Comercial · Análisis":
        return (
          <DashboardV2
            cambiarPantalla={setPantalla}
            tabInicial="comercial"
          />
        )

      case "Comercial · Ventas":
      case "Ventas":
      case "Ventas por cliente y SKU":
        return <VentasClienteSku />

      case "Reporte de devoluciones":
        return <ReporteDevoluciones cambiarPantalla={setPantalla} />

      case "Comercial · Descuentos":
      case "Descuentos y promociones":
        return <DescuentosPromociones />

      case "Comercial · Clientes":
        return <ComercialClientes cambiarPantalla={setPantalla} />

      case "Comercial · KPI KAM":
      case "KPI KAM":
        return <KpiKam cambiarPantalla={setPantalla} />

      case "Comercial · SKU":
        return <PantallaEnConstruccion titulo={pantalla} />

      // ---------------------------------------------------------
      // PRODUCCIÓN
      // ---------------------------------------------------------
      case "Producción · Resumen":
      case "Producción · Planificación":
      case "Producción · Producción":
      case "Producción":
        return <ProduccionV2 />

      case "Producción · Fórmulas":
      case "Preformulación":
        return <Formulas />

      case "Producción · Etiquetado":
      case "Semielaborados":
        return <EtiquetadoSemielaborados />

      case "Hoja de producción":
        return <HojaProduccion />

      case "Producción · Análisis":
        return <Reportes cambiarPantalla={setPantalla} />

      case "Producción · Semielaborados":
      case "Producción · Historial":
        return <PantallaEnConstruccion titulo={pantalla} />

      // ---------------------------------------------------------
      // INVENTARIO Y DESPACHOS
      // ---------------------------------------------------------
      case "Inventario y Despachos · Resumen":
      case "Inventario y Despachos · Inventario":
      case "Inventario":
        return <InventarioV2 />

      case "Inventario y Despachos · Preparación":
      case "Inventario y Despachos · Despachos":
      case "Despachos":
        return <DespachosV2 />

      case "Inventario y Despachos · Historial":
      case "Historial despachos":
        return <HistorialDespachos />

      case "Inventario y Despachos · Documentos":
      case "Documentos":
        return <Documentos cambiarPantalla={setPantalla} />

      case "Hoja de despacho":
        return <HojaDespacho />

      case "Anexo Supermaxi":
        return <AnexoSupermaxi />

      case "Inventario y Despachos · Análisis":
        return <Reportes cambiarPantalla={setPantalla} />


      // ---------------------------------------------------------
      // COMPRAS
      // ---------------------------------------------------------
      case "Compras · Materias Primas y Empaques":
      case "Materias primas":
        return <MateriasPrimas />

      case "Compras · Facturas":
        return <PagosGastos />

      case "Compras · Resumen":
      case "Compras · Proveedores":
      case "Compras · Costos":
      case "Compras · Historial":
      case "Compras · Análisis":
        return <PantallaEnConstruccion titulo={pantalla} />

      // ---------------------------------------------------------
      // PAGOS Y FINANZAS
      // ---------------------------------------------------------
      case "Pagos y Finanzas · Resultados":
        return <CostosIndirectos />

      case "Pagos y Finanzas · Rentabilidad":
        return <RentabilidadComercial />

      case "Pagos y Finanzas · Clasificación de gastos":
        return <ClasificacionGastos />

      case "Pagos y Finanzas · Importación contable":
        return <ImportacionContable cambiarPantalla={setPantalla} />

      case "Pagos y Finanzas · Resumen":
      case "Pagos y Finanzas · Cuentas por Pagar":
      case "Pagos y Finanzas · Pagos":
      case "Pagos y Finanzas · Historial":
      case "Pagos y gastos":
        return <PagosGastos />

      case "Pagos y Finanzas · Roles de pago":
      case "Roles de pago":
        return <RolesPago />

      case "Costos indirectos":
        return <CostosIndirectos />

      case "Rentabilidad por SKU":
        return <ReporteRentabilidadSku />

      case "Simulador":
        return <SimuladorRentabilidad />

      case "Pagos y Finanzas · Análisis":
      case "Reportes":
        return <Reportes cambiarPantalla={setPantalla} />

      case "Pagos y Finanzas · Cuentas por Cobrar":
      case "Pagos y Finanzas · Cobros y Conciliación":
      case "Pagos y Finanzas · Tesorería":
        return <PantallaEnConstruccion titulo={pantalla} />

      // ---------------------------------------------------------
      // ADMINISTRACIÓN
      // ---------------------------------------------------------
      case "Administración · Usuarios y Permisos":
      case "Usuarios y permisos":
        return <UsuariosPermisos />

      case "Administración · Resumen":
      case "Administración":
        return <Administracion cambiarPantalla={setPantalla} />

      case "Administración · Maestros":
      case "Administración · Configuración":
      case "Administración · Importaciones":
      case "Administración · Auditoría":
      case "Administración · Sistema":
        return <PantallaEnConstruccion titulo={pantalla} />

      default:
        return <PantallaEnConstruccion titulo={pantalla} />
    }
  }

  return (
    <Layout
      pantalla={pantalla}
      cambiarPantalla={setPantalla}
      cerrarSesion={cerrarSesion}
      usuario={sesion.user.email}
    >
      <Suspense fallback={<CargandoModulo />}>
        {renderPantalla()}
      </Suspense>
      <InstalarApp />
    </Layout>
  )
}

function CargandoModulo() {
  return (
    <section style={cargaModulo}>
      <div style={pulsoModulo}>C1</div>
      <div>
        <strong style={{ display: "block", color: "#25272b" }}>Abriendo módulo…</strong>
        <small style={{ color: "#6b7280" }}>Cargando solo la información necesaria.</small>
      </div>
    </section>
  )
}

const cargaModulo = {
  minHeight: "220px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  padding: "28px",
}

const pulsoModulo = {
  width: "42px",
  height: "42px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  background: "#8F1D24",
  color: "white",
  fontWeight: 800,
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

export default App
