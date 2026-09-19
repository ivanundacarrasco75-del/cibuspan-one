type DocumentosProps = {
  cambiarPantalla: (pantalla: string) => void
}

export default function Documentos({
  cambiarPantalla,
}: DocumentosProps) {
  const documentos = [
    {
      titulo: "Hoja de producción",
      descripcion:
        "Documento para informar a Producción cuántas paradas o batches debe fabricar de cada producto.",
      pantalla: "Hoja de producción",
    },
    {
      titulo: "Hoja de despacho por ruta",
      descripcion:
        "Selecciona los pedidos de una ruta, consulta cuánto lleva cada cliente y el total consolidado por SKU.",
      pantalla: "Hoja de despacho",
    },
    {
      titulo: "Anexo Supermaxi",
      descripcion:
        "Documento de lotes, fechas de elaboración, caducidad y unidades para Corporación Favorita.",
      pantalla: "Anexo Supermaxi",
    },
    {
      titulo: "Lista de despacho",
      descripcion:
        "Documento para preparación, revisión y salida de pedidos.",
      pantalla: "Despachos",
    },
    {
      titulo: "Historial de despachos",
      descripcion:
        "Consulta de pedidos, clientes, lotes y cantidades despachadas.",
      pantalla: "Historial despachos",
    },
  ]

  return (
    <main style={pagina}>
      <header style={cabecera}>
        <div>
          <span style={etiqueta}>
            REPORTES Y DOCUMENTOS
          </span>

          <h1 style={tituloPrincipal}>
            Documentos
          </h1>

          <p style={introduccion}>
            Selecciona el documento que deseas
            consultar, generar, compartir o imprimir.
          </p>
        </div>
      </header>

      <section style={rejilla}>
        {documentos.map((documento) => (
          <article
            key={documento.titulo}
            style={tarjeta}
          >
            <div>
              <h2 style={titulo}>
                {documento.titulo}
              </h2>

              <p style={descripcion}>
                {documento.descripcion}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                cambiarPantalla(
                  documento.pantalla,
                )
              }
              style={boton}
            >
              Abrir documento
            </button>
          </article>
        ))}
      </section>
    </main>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1300px",
  margin: "0 auto",
  color: "#25272b",
}

const cabecera = {
  marginBottom: "26px",
}

const etiqueta = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
}

const tituloPrincipal = {
  margin: "5px 0",
  fontSize: "32px",
}

const introduccion = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.5,
}

const rejilla = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "18px",
}

const tarjeta = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  gap: "20px",
  minHeight: "220px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 6px 18px rgba(15, 23, 42, 0.05)",
}

const titulo = {
  marginTop: 0,
  marginBottom: "12px",
  color: "#8f1d24",
  fontSize: "21px",
}

const descripcion = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.5,
}

const boton = {
  width: "100%",
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}