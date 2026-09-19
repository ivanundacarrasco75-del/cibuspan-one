import { useEffect, useMemo, useState, type ReactNode } from "react"

type LayoutProps = {
  pantalla: string
  cambiarPantalla: (pantalla: string) => void
  cerrarSesion?: () => void | Promise<void>
  usuario?: string | null
  children: ReactNode
}

type IconoNombre =
  | "inicio"
  | "comercial"
  | "produccion"
  | "inventario"
  | "compras"
  | "finanzas"
  | "administracion"
  | "mas"
  | "salir"
  | "menu"
  | "cerrar"

type ItemSubmenu = {
  pantalla: string
  etiqueta: string
}

type Modulo = {
  id:
    | "Inicio"
    | "Comercial"
    | "Producción"
    | "Inventario y Despachos"
    | "Compras"
    | "Pagos y Finanzas"
    | "Administración"
  etiqueta: string
  icono: IconoNombre
  entrada: string
  items: ItemSubmenu[]
}

const COLOR_VINO = "#8F1D24"
const COLOR_VINO_OSCURO = "#68151A"
const COLOR_NARANJA = "#F7931E"
const COLOR_FONDO = "#F8F5F1"

const modulos: Modulo[] = [
  {
    id: "Inicio",
    etiqueta: "Inicio",
    icono: "inicio",
    entrada: "Dashboard",
    items: [],
  },
  {
    id: "Comercial",
    etiqueta: "Comercial",
    icono: "comercial",
    entrada: "Comercial · Pedidos",
    items: [
      
      { pantalla: "Comercial · Pedidos", etiqueta: "Pedidos" },
      { pantalla: "Comercial · Ventas", etiqueta: "Ventas" },
      { pantalla: "Comercial · Importar facturación", etiqueta: "Importar facturación" },
      { pantalla: "Comercial · Devoluciones", etiqueta: "Devoluciones" },
      { pantalla: "Comercial · Descuentos", etiqueta: "Descuentos" },
    ],
  },
  {
    id: "Producción",
    etiqueta: "Producción",
    icono: "produccion",
    entrada: "Producción · Resumen",
    items: [
      { pantalla: "Producción · Resumen", etiqueta: "Resumen" },
      { pantalla: "Producción · Planificación", etiqueta: "Planificación" },
      { pantalla: "Producción · Producción", etiqueta: "Producción" },
      { pantalla: "Producción · Fórmulas", etiqueta: "Fórmulas" },
      { pantalla: "Producción · Semielaborados", etiqueta: "Semielaborados" },
      { pantalla: "Producción · Etiquetado", etiqueta: "Etiquetado" },
      { pantalla: "Producción · Historial", etiqueta: "Historial" },
      { pantalla: "Producción · Análisis", etiqueta: "Análisis" },
    ],
  },
  {
    id: "Inventario y Despachos",
    etiqueta: "Inventario y Despachos",
    icono: "inventario",
    entrada: "Inventario y Despachos · Resumen",
    items: [
      { pantalla: "Inventario y Despachos · Resumen", etiqueta: "Resumen" },
      { pantalla: "Inventario y Despachos · Inventario", etiqueta: "Inventario" },
      { pantalla: "Inventario y Despachos · Preparación", etiqueta: "Preparación" },
      { pantalla: "Inventario y Despachos · Despachos", etiqueta: "Despachos" },
      { pantalla: "Inventario y Despachos · Documentos", etiqueta: "Documentos" },
      { pantalla: "Inventario y Despachos · Historial", etiqueta: "Historial" },
      { pantalla: "Inventario y Despachos · Análisis", etiqueta: "Análisis" },
    ],
  },
  {
    id: "Compras",
    etiqueta: "Compras",
    icono: "compras",
    entrada: "Compras · Resumen",
    items: [
      { pantalla: "Compras · Resumen", etiqueta: "Resumen" },
      { pantalla: "Compras · Proveedores", etiqueta: "Proveedores" },
      { pantalla: "Compras · Facturas", etiqueta: "Facturas" },
      {
        pantalla: "Compras · Materias Primas y Empaques",
        etiqueta: "Materias Primas y Empaques",
      },
      { pantalla: "Compras · Costos", etiqueta: "Costos" },
      { pantalla: "Compras · Historial", etiqueta: "Historial" },
      { pantalla: "Compras · Análisis", etiqueta: "Análisis" },
    ],
  },
  {
    id: "Pagos y Finanzas",
    etiqueta: "Pagos y Finanzas",
    icono: "finanzas",
    entrada: "Pagos y Finanzas · Resumen",
    items: [
      { pantalla: "Pagos y Finanzas · Resumen", etiqueta: "Resumen" },
      { pantalla: "Pagos y Finanzas · Cuentas por Cobrar", etiqueta: "Cuentas por Cobrar" },
      { pantalla: "Pagos y Finanzas · Cobros y Conciliación", etiqueta: "Cobros y Conciliación" },
      { pantalla: "Pagos y Finanzas · Cuentas por Pagar", etiqueta: "Cuentas por Pagar" },
      { pantalla: "Pagos y Finanzas · Pagos", etiqueta: "Pagos" },
      { pantalla: "Pagos y Finanzas · Tesorería", etiqueta: "Tesorería" },
      { pantalla: "Pagos y Finanzas · Resultados", etiqueta: "Resultados" },
      { pantalla: "Pagos y Finanzas · Rentabilidad", etiqueta: "Rentabilidad" },
      { pantalla: "Pagos y Finanzas · Historial", etiqueta: "Historial" },
      { pantalla: "Pagos y Finanzas · Análisis", etiqueta: "Análisis" },
    ],
  },
  {
    id: "Administración",
    etiqueta: "Administración",
    icono: "administracion",
    entrada: "Administración · Resumen",
    items: [
      { pantalla: "Administración · Resumen", etiqueta: "Resumen" },
      { pantalla: "Administración · Usuarios y Permisos", etiqueta: "Usuarios y Permisos" },
      { pantalla: "Administración · Maestros", etiqueta: "Maestros" },
      { pantalla: "Administración · Configuración", etiqueta: "Configuración" },
      { pantalla: "Administración · Importaciones", etiqueta: "Importaciones" },
      { pantalla: "Administración · Auditoría", etiqueta: "Auditoría" },
      { pantalla: "Administración · Sistema", etiqueta: "Sistema" },
    ],
  },
]

function moduloDePantalla(pantalla: string): Modulo["id"] {
  if (pantalla === "Dashboard") return "Inicio"

  if (pantalla.startsWith("Comercial ·")) return "Comercial"
  if (pantalla.startsWith("Producción ·")) return "Producción"
  if (pantalla.startsWith("Inventario y Despachos ·")) return "Inventario y Despachos"
  if (pantalla.startsWith("Compras ·")) return "Compras"
  if (pantalla.startsWith("Pagos y Finanzas ·")) return "Pagos y Finanzas"
  if (pantalla.startsWith("Administración ·")) return "Administración"

  // Compatibilidad temporal con accesos internos de las pantallas actuales.
  if ([
    "Pedidos",
    "Devoluciones",
    "Ventas",
    "Ventas por cliente y SKU",
    "Reporte de devoluciones",
    "Descuentos y promociones",
  ].includes(pantalla)) return "Comercial"
  if (["Producción", "Preformulación", "Semielaborados", "Hoja de producción"].includes(pantalla)) {
    return "Producción"
  }
  if (
    [
      "Inventario",
      "Despachos",
      "Historial despachos",
      "Documentos",
      "Hoja de despacho",
      "Anexo Supermaxi",
    ].includes(pantalla)
  ) {
    return "Inventario y Despachos"
  }
  if (pantalla === "Materias primas") return "Compras"
  if ([
    "Reportes",
    "Pagos y gastos",
    "Roles de pago",
    "Costos indirectos",
    "Rentabilidad por SKU",
    "Simulador",
  ].includes(pantalla)) return "Pagos y Finanzas"
  if (["Administración", "Usuarios y permisos"].includes(pantalla)) return "Administración"

  return "Inicio"
}

export default function Layout({
  pantalla,
  cambiarPantalla,
  cerrarSesion,
  usuario,
  children,
}: LayoutProps) {
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const [menuMasAbierto, setMenuMasAbierto] = useState(false)

  const moduloActualId = moduloDePantalla(pantalla)
  const moduloActual = useMemo(
    () => modulos.find((modulo) => modulo.id === moduloActualId) ?? modulos[0],
    [moduloActualId],
  )

  useEffect(() => {
    setMenuMovilAbierto(false)
    setMenuMasAbierto(false)
  }, [pantalla])

  function navegar(destino: string) {
    cambiarPantalla(destino)
  }

  const inicial = (usuario?.trim()?.[0] ?? "C").toUpperCase()

  const modulosMovilMas = modulos.filter(
    (modulo) =>
      !["Inicio", "Comercial", "Producción", "Inventario y Despachos"].includes(modulo.id),
  )

  return (
    <div className="c1-shell">
      <style>{css}</style>

      <aside className="c1-sidebar">
        <Marca />

        <nav className="c1-menu-desktop" aria-label="Navegación principal">
          {modulos.map((modulo) => (
            <BotonMenu
              key={modulo.id}
              activo={moduloActualId === modulo.id}
              etiqueta={modulo.etiqueta}
              icono={modulo.icono}
              onClick={() => navegar(modulo.entrada)}
            />
          ))}
        </nav>

        <div className="c1-sidebar-bottom">
          <button
            type="button"
            className="c1-user"
            onClick={cerrarSesion}
            title={cerrarSesion ? "Cerrar sesión" : undefined}
          >
            <span className="c1-avatar">{inicial}</span>
            <span className="c1-user-text">
              <strong>Usuario</strong>
              <small>{usuario || "CIBUSPAN ONE"}</small>
            </span>
            {cerrarSesion && <Icono nombre="salir" />}
          </button>
        </div>
      </aside>

      <header className="c1-mobile-header">
        <button
          type="button"
          className="c1-icon-button c1-menu-trigger"
          onClick={() => setMenuMovilAbierto(true)}
          aria-label="Abrir menú"
        >
          <Icono nombre="menu" />
        </button>

        <Marca compacta />

        <button
          type="button"
          className="c1-avatar-mobile"
          onClick={cerrarSesion}
          aria-label="Usuario"
        >
          {inicial}
        </button>
      </header>

      <main className="c1-content">
        {moduloActual.items.length > 0 && (
          <div className="c1-subnav-shell">
            <div className="c1-module-title">{moduloActual.etiqueta}</div>
            <nav className="c1-subnav" aria-label={`Opciones de ${moduloActual.etiqueta}`}>
              {moduloActual.items.map((item) => (
                <button
                  key={item.pantalla}
                  type="button"
                  className={`c1-subnav-item ${
                    pantalla === item.pantalla ? "activo" : ""
                  }`}
                  onClick={() => navegar(item.pantalla)}
                >
                  {item.etiqueta}
                </button>
              ))}
            </nav>
          </div>
        )}

        <div className="c1-page-slot">{children}</div>
      </main>

      <nav className="c1-bottom-nav" aria-label="Navegación móvil">
        <BotonInferior
          activo={moduloActualId === "Inicio"}
          etiqueta="Inicio"
          icono="inicio"
          onClick={() => navegar("Dashboard")}
        />
        <BotonInferior
          activo={moduloActualId === "Comercial"}
          etiqueta="Comercial"
          icono="comercial"
          onClick={() => navegar("Comercial · Pedidos")}
        />
        <BotonInferior
          activo={moduloActualId === "Producción"}
          etiqueta="Producción"
          icono="produccion"
          onClick={() => navegar("Producción · Resumen")}
        />
        <BotonInferior
          activo={moduloActualId === "Inventario y Despachos"}
          etiqueta="Inventario"
          icono="inventario"
          onClick={() => navegar("Inventario y Despachos · Resumen")}
        />
        <BotonInferior
          activo={modulosMovilMas.some((modulo) => modulo.id === moduloActualId)}
          etiqueta="Más"
          icono="mas"
          onClick={() => setMenuMasAbierto(true)}
        />
      </nav>

      {menuMovilAbierto && (
        <div className="c1-overlay" onClick={() => setMenuMovilAbierto(false)}>
          <aside className="c1-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="c1-drawer-header">
              <Marca />
              <button
                type="button"
                className="c1-icon-button"
                onClick={() => setMenuMovilAbierto(false)}
                aria-label="Cerrar menú"
              >
                <Icono nombre="cerrar" />
              </button>
            </div>

            <nav className="c1-drawer-menu">
              {modulos.map((modulo) => (
                <BotonMenu
                  key={modulo.id}
                  activo={moduloActualId === modulo.id}
                  etiqueta={modulo.etiqueta}
                  icono={modulo.icono}
                  onClick={() => navegar(modulo.entrada)}
                />
              ))}
            </nav>

            {cerrarSesion && (
              <button type="button" className="c1-logout" onClick={cerrarSesion}>
                <Icono nombre="salir" />
                Cerrar sesión
              </button>
            )}
          </aside>
        </div>
      )}

      {menuMasAbierto && (
        <div
          className="c1-overlay c1-overlay-bottom"
          onClick={() => setMenuMasAbierto(false)}
        >
          <section className="c1-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="c1-sheet-handle" />
            <h3>Más módulos</h3>
            <div className="c1-sheet-grid">
              {modulosMovilMas.map((modulo) => (
                <button
                  key={modulo.id}
                  type="button"
                  className={`c1-sheet-item ${
                    moduloActualId === modulo.id ? "activo" : ""
                  }`}
                  onClick={() => navegar(modulo.entrada)}
                >
                  <Icono nombre={modulo.icono} />
                  <span>{modulo.etiqueta}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <div className={`c1-brand ${compacta ? "compacta" : ""}`} aria-label="CIBUSPAN ONE">
      <span className="c1-brand-symbol" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="c1-brand-cibus">CIBUSPAN</span>
      <span className="c1-brand-one">ONE</span>
    </div>
  )
}

function BotonMenu({
  activo,
  etiqueta,
  icono,
  onClick,
}: {
  activo: boolean
  etiqueta: string
  icono: IconoNombre
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`c1-menu-item ${activo ? "activo" : ""}`}
      onClick={onClick}
    >
      <Icono nombre={icono} />
      <span>{etiqueta}</span>
    </button>
  )
}

function BotonInferior({
  activo,
  etiqueta,
  icono,
  onClick,
}: {
  activo: boolean
  etiqueta: string
  icono: IconoNombre
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`c1-bottom-item ${activo ? "activo" : ""}`}
      onClick={onClick}
    >
      <Icono nombre={icono} />
      <span>{etiqueta}</span>
    </button>
  )
}

function Icono({ nombre }: { nombre: IconoNombre }) {
  const paths: Record<IconoNombre, ReactNode> = {
    inicio: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-7h6v7" />
      </>
    ),
    comercial: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 2 5-6" />
        <path d="M16 7h3v3" />
      </>
    ),
    produccion: (
      <>
        <path d="M4 20V9l5 3V7l5 3V4h3v16H4Z" />
        <path d="M8 16h2M13 16h2" />
      </>
    ),
    inventario: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
        <path d="M12 11v10" />
      </>
    ),
    compras: (
      <>
        <circle cx="9" cy="20" r="1.3" />
        <circle cx="18" cy="20" r="1.3" />
        <path d="M3 4h2l2.2 10.5a2 2 0 0 0 2 1.5h8.6a2 2 0 0 0 2-1.6L21 8H7" />
      </>
    ),
    finanzas: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
        <path d="M7 15h4" />
        <path d="M16 13v4M14 15h4" />
      </>
    ),
    administracion: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.2H9.6V21a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.9.3l-.1.1L3.4 17l.1-.1A1.7 1.7 0 0 0 3.8 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2V9.6h.2a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L6.2 3.4l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2h3.9v.2a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.2v3.9h-.2a1.7 1.7 0 0 0-1 .4 1.7 1.7 0 0 0-.5 1.1Z" />
      </>
    ),
    mas: (
      <>
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="19" cy="12" r="1.2" />
      </>
    ),
    salir: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M14 3h6v18h-6" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    cerrar: <path d="m6 6 12 12M18 6 6 18" />,
  }

  return (
    <svg
      className="c1-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[nombre]}
    </svg>
  )
}

const css = `
  * { box-sizing: border-box; }
  :root {
    --c1-vino: ${COLOR_VINO};
    --c1-vino-oscuro: ${COLOR_VINO_OSCURO};
    --c1-naranja: ${COLOR_NARANJA};
    --c1-fondo: ${COLOR_FONDO};
  }

  body { margin: 0; background: var(--c1-fondo); }

  .c1-shell {
    min-height: 100vh;
    background: var(--c1-fondo);
    color: #2b2422;
  }

  .c1-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 244px;
    z-index: 900;
    display: flex;
    flex-direction: column;
    padding: 22px 16px 18px;
    background: linear-gradient(180deg, #73191f 0%, #5d151a 100%);
    color: white;
    box-shadow: 6px 0 24px rgba(69,22,22,.12);
  }

  .c1-brand {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 48px;
    padding: 0 8px;
    white-space: nowrap;
  }

  .c1-brand-symbol {
    position: relative;
    width: 27px;
    height: 30px;
    flex: 0 0 27px;
  }

  .c1-brand-symbol i {
    position: absolute;
    left: 3px;
    width: 20px;
    height: 12px;
    background: var(--c1-naranja);
    border-radius: 100% 0 100% 0;
    transform-origin: 0 50%;
  }

  .c1-brand-symbol i:first-child {
    top: 2px;
    transform: rotate(-25deg);
  }

  .c1-brand-symbol i:last-child {
    bottom: 2px;
    transform: rotate(25deg) scaleY(-1);
  }

  .c1-brand-cibus {
    font-size: 20px;
    font-weight: 900;
    letter-spacing: -.7px;
    color: white;
  }

  .c1-brand-one {
    font-size: 20px;
    font-weight: 900;
    color: var(--c1-naranja);
    letter-spacing: -.7px;
  }

  .c1-menu-desktop {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 26px;
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-width: thin;
  }

  .c1-menu-item {
    width: 100%;
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 13px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: rgba(255,255,255,.9);
    font: inherit;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
    transition: .18s ease;
  }

  .c1-menu-item:hover {
    background: rgba(255,255,255,.08);
  }

  .c1-menu-item.activo {
    background: var(--c1-naranja);
    color: white;
    box-shadow: 0 8px 20px rgba(247,147,30,.2);
  }

  .c1-icon {
    width: 21px;
    height: 21px;
    flex: 0 0 21px;
  }

  .c1-sidebar-bottom {
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid rgba(255,255,255,.12);
  }

  .c1-user {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: 0;
    background: transparent;
    color: white;
    text-align: left;
    cursor: pointer;
    border-radius: 10px;
  }

  .c1-user:hover {
    background: rgba(255,255,255,.08);
  }

  .c1-avatar,
  .c1-avatar-mobile {
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-weight: 800;
  }

  .c1-avatar {
    width: 38px;
    height: 38px;
    background: white;
    color: var(--c1-vino);
  }

  .c1-user-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .c1-user-text strong {
    font-size: 13px;
  }

  .c1-user-text small {
    max-width: 145px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgba(255,255,255,.65);
  }

  .c1-content {
    min-height: 100vh;
    margin-left: 244px;
    padding: 0;
    overflow-x: hidden;
  }

  .c1-subnav-shell {
    position: sticky;
    top: 0;
    z-index: 700;
    padding: 13px 20px 10px;
    border-bottom: 1px solid #eadfd8;
    background: rgba(248,245,241,.96);
    backdrop-filter: blur(12px);
  }

  .c1-module-title {
    margin: 0 0 8px 2px;
    color: var(--c1-vino);
    font-size: 13px;
    font-weight: 850;
    letter-spacing: .02em;
    text-transform: uppercase;
  }

  .c1-subnav {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: thin;
  }

  .c1-subnav-item {
    flex: 0 0 auto;
    min-height: 34px;
    padding: 0 13px;
    border: 1px solid #e4d8d2;
    border-radius: 999px;
    background: white;
    color: #655650;
    font: inherit;
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
    transition: .16s ease;
  }

  .c1-subnav-item:hover {
    border-color: #cba89b;
    color: var(--c1-vino);
  }

  .c1-subnav-item.activo {
    border-color: var(--c1-vino);
    background: var(--c1-vino);
    color: white;
  }

  .c1-page-slot {
    min-height: calc(100vh - 72px);
  }

  .c1-mobile-header,
  .c1-bottom-nav {
    display: none;
  }

  .c1-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    background: rgba(40,15,15,.48);
  }

  .c1-drawer {
    width: min(86vw, 340px);
    height: 100%;
    padding: 18px;
    background: linear-gradient(180deg, #73191f 0%, #5d151a 100%);
    color: white;
    box-shadow: 20px 0 60px rgba(0,0,0,.22);
  }

  .c1-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .c1-drawer-menu {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 20px;
  }

  .c1-icon-button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .c1-logout {
    width: 100%;
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 18px;
    padding: 0 13px;
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 10px;
    background: rgba(255,255,255,.06);
    color: white;
    font-weight: 700;
    cursor: pointer;
  }

  .c1-overlay-bottom {
    display: flex;
    align-items: flex-end;
  }

  .c1-sheet {
    width: 100%;
    padding: 10px 16px calc(22px + env(safe-area-inset-bottom));
    border-radius: 22px 22px 0 0;
    background: white;
    color: #2b2422;
    box-shadow: 0 -12px 50px rgba(0,0,0,.18);
  }

  .c1-sheet-handle {
    width: 44px;
    height: 5px;
    margin: 0 auto 14px;
    border-radius: 999px;
    background: #d8d2cf;
  }

  .c1-sheet h3 {
    margin: 0 0 14px;
    color: var(--c1-vino);
  }

  .c1-sheet-grid {
    display: grid;
    grid-template-columns: repeat(2,1fr);
    gap: 10px;
  }

  .c1-sheet-item {
    min-height: 82px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 10px;
    border: 1px solid #eee5df;
    border-radius: 14px;
    background: #fffaf7;
    color: #5e4e49;
    font-weight: 700;
    cursor: pointer;
  }

  .c1-sheet-item.activo {
    border-color: var(--c1-naranja);
    color: var(--c1-vino);
    background: #fff4e6;
  }

  @media (max-width: 820px) {
    .c1-sidebar {
      display: none;
    }

    .c1-content {
      margin-left: 0;
      padding-top: 60px;
      padding-bottom: calc(68px + env(safe-area-inset-bottom));
    }

    .c1-mobile-header {
      position: fixed;
      inset: 0 0 auto 0;
      z-index: 1000;
      height: 60px;
      display: grid;
      grid-template-columns: 48px 1fr 48px;
      align-items: center;
      padding: 0 8px;
      background: linear-gradient(90deg, #73191f, #8f1d24);
      color: white;
      box-shadow: 0 2px 14px rgba(69,22,22,.18);
    }

    .c1-mobile-header .c1-brand {
      justify-self: center;
      padding: 0;
      transform: scale(.86);
      transform-origin: center;
    }

    .c1-menu-trigger {
      justify-self: start;
    }

    .c1-avatar-mobile {
      width: 34px;
      height: 34px;
      justify-self: end;
      border: 1px solid rgba(255,255,255,.35);
      background: rgba(255,255,255,.1);
      color: white;
    }

    .c1-subnav-shell {
      top: 0;
      padding: 9px 10px 8px;
    }

    .c1-module-title {
      display: none;
    }

    .c1-subnav-item {
      min-height: 32px;
      padding: 0 11px;
      font-size: 11px;
    }

    .c1-bottom-nav {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 1000;
      height: calc(64px + env(safe-area-inset-bottom));
      display: grid;
      grid-template-columns: repeat(5,1fr);
      padding: 6px 6px env(safe-area-inset-bottom);
      border-top: 1px solid #eee4df;
      background: rgba(255,255,255,.97);
      backdrop-filter: blur(12px);
      box-shadow: 0 -6px 24px rgba(78,49,39,.08);
    }

    .c1-bottom-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border: 0;
      background: transparent;
      color: #74655f;
      font-size: 10px;
      cursor: pointer;
    }

    .c1-bottom-item .c1-icon {
      width: 20px;
      height: 20px;
    }

    .c1-bottom-item.activo {
      color: var(--c1-naranja);
      font-weight: 800;
    }
  }
`
