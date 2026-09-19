type SidebarProps = {
  pantalla: string
  cambiarPantalla: (pantalla: string) => void
}

const menuItems = [
  "Dashboard",
  "Pedidos",
  "Inventario",
  "Producción",
  "Despachos",
  "Historial despachos",
  "Devoluciones",
  "Reportes",
  "Documentos",
  "Administración",
  "Configuración",
]

export default function Sidebar({
  pantalla,
  cambiarPantalla,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">C1</div>

        <div>
          <h2>CIBUSPAN ONE</h2>
          <p>Sistema Integral de Producción</p>
        </div>
      </div>

      <nav className="sidebar-menu">
        {menuItems.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => cambiarPantalla(item)}
            style={{
              fontWeight:
                pantalla === item ? "bold" : "normal",
              background:
                pantalla === item
                  ? "#ececec"
                  : "transparent",
            }}
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  )
}