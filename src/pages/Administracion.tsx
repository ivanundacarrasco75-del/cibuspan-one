import { useEffect, useMemo, useState } from "react"
import {
  asignarProductoClienteDb,
  cambiarEstadoBodegaDb,
  cambiarEstadoClienteDb,
  cambiarEstadoClienteProductoDb,
  cambiarEstadoProductoDb,
  crearBodegaDb,
  crearClienteDb,
  crearProductoDb,
  obtenerBodegasDb,
  obtenerClienteProductosDb,
  obtenerClientesDb,
  obtenerProductosDb,
  type BodegaDb,
  type ClienteDb,
  type ClienteProductoDb,
  type ProductoDb,
} from "../services/catalogoService"
import ModalMensaje from "../components/ModalMensaje"

type AreaAdministracion =
  | "CATALOGOS"
  | "COSTOS"
  | "SISTEMA"

type Seccion =
  | "CLIENTES"
  | "BODEGAS"
  | "PRODUCTOS"
  | "ASIGNACIONES"

type AdministracionProps = {
  cambiarPantalla: (pantalla: string) => void
  puedeGestionarUsuarios?: boolean
}

export default function Administracion({
  cambiarPantalla,
  puedeGestionarUsuarios = false,
}: AdministracionProps) {
  const [area, setArea] =
    useState<AreaAdministracion>("CATALOGOS")

  const [seccion, setSeccion] =
    useState<Seccion>("CLIENTES")

  const [clientes, setClientes] = useState<ClienteDb[]>([])
  const [bodegas, setBodegas] = useState<BodegaDb[]>([])
  const [productos, setProductos] = useState<ProductoDb[]>([])
  const [asignaciones, setAsignaciones] = useState<
    ClienteProductoDb[]
  >([])

  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const [nuevoCliente, setNuevoCliente] = useState("")

  const [bodegaClienteId, setBodegaClienteId] = useState("")
  const [nombreBodega, setNombreBodega] = useState("")
  const [tipoEmpaque, setTipoEmpaque] = useState("")

  const [codigoProducto, setCodigoProducto] = useState("")
  const [nombreProducto, setNombreProducto] = useState("")
  const [cortoProducto, setCortoProducto] = useState("")
  const [loteProduccion, setLoteProduccion] = useState("1")
  const [stockSeguridad, setStockSeguridad] = useState("0")
  const [vidaUtil, setVidaUtil] = useState("30")

  const [asignacionClienteId, setAsignacionClienteId] =
    useState("")
  const [asignacionProductoId, setAsignacionProductoId] =
    useState("")
  const [unidadManejo, setUnidadManejo] = useState("1")
  const [precio, setPrecio] = useState("")

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    setError("")

    try {
      const [
        clientesDb,
        bodegasDb,
        productosDb,
        asignacionesDb,
      ] = await Promise.all([
        obtenerClientesDb(),
        obtenerBodegasDb(),
        obtenerProductosDb(),
        obtenerClienteProductosDb(),
      ])

      setClientes(clientesDb)
      setBodegas(bodegasDb)
      setProductos(productosDb)
      setAsignaciones(asignacionesDb)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los catálogos.",
      )
    } finally {
      setCargando(false)
    }
  }

  function limpiarMensajes() {
    setMensaje("")
    setError("")
  }

  async function crearCliente() {
    limpiarMensajes()

    try {
      await crearClienteDb(nuevoCliente)
      setNuevoCliente("")
      setMensaje("Cliente creado correctamente.")
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el cliente.",
      )
    }
  }

  async function cambiarCliente(
    cliente: ClienteDb,
  ) {
    limpiarMensajes()

    try {
      await cambiarEstadoClienteDb(
        cliente.id,
        !cliente.activo,
      )

      setMensaje(
        cliente.activo
          ? "Cliente desactivado."
          : "Cliente activado.",
      )

      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el cliente.",
      )
    }
  }

  async function crearBodega() {
    limpiarMensajes()

    try {
      await crearBodegaDb({
        clienteId: bodegaClienteId,
        nombre: nombreBodega,
        tipoEmpaque,
      })

      setNombreBodega("")
      setTipoEmpaque("")
      setMensaje("Bodega creada correctamente.")
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la bodega.",
      )
    }
  }

  async function cambiarBodega(
    bodega: BodegaDb,
  ) {
    limpiarMensajes()

    try {
      await cambiarEstadoBodegaDb(
        bodega.id,
        !bodega.activo,
      )

      setMensaje(
        bodega.activo
          ? "Bodega desactivada."
          : "Bodega activada.",
      )

      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la bodega.",
      )
    }
  }

  async function crearProducto() {
    limpiarMensajes()

    try {
      await crearProductoDb({
        codigo: codigoProducto,
        nombre: nombreProducto,
        corto: cortoProducto,
        loteProduccion: Number(loteProduccion),
        stockSeguridad: Number(stockSeguridad),
        vidaUtilDias: Number(vidaUtil),
      })

      setCodigoProducto("")
      setNombreProducto("")
      setCortoProducto("")
      setLoteProduccion("1")
      setStockSeguridad("0")
      setVidaUtil("30")
      setMensaje("Producto creado correctamente.")
      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el producto.",
      )
    }
  }

  async function cambiarProducto(
    producto: ProductoDb,
  ) {
    limpiarMensajes()

    try {
      await cambiarEstadoProductoDb(
        producto.id,
        !producto.activo,
      )

      setMensaje(
        producto.activo
          ? "Producto desactivado."
          : "Producto activado.",
      )

      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el producto.",
      )
    }
  }

  async function asignarProducto() {
    limpiarMensajes()

    try {
      await asignarProductoClienteDb({
        clienteId: asignacionClienteId,
        productoId: asignacionProductoId,
        unidadManejo: Number(unidadManejo),
        precio:
          precio.trim() === ""
            ? null
            : Number(precio),
      })

      setAsignacionProductoId("")
      setUnidadManejo("1")
      setPrecio("")
      setMensaje(
        "Producto asignado al cliente correctamente.",
      )

      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo asignar el producto.",
      )
    }
  }

  async function cambiarAsignacion(
    asignacion: ClienteProductoDb,
  ) {
    limpiarMensajes()

    try {
      await cambiarEstadoClienteProductoDb(
        asignacion.id,
        !asignacion.activo,
      )

      setMensaje(
        asignacion.activo
          ? "Asignación desactivada."
          : "Asignación activada.",
      )

      await cargarDatos()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la asignación.",
      )
    }
  }

  const bodegasOrdenadas = useMemo(() => {
    return [...bodegas].sort((a, b) => {
      const clienteA =
        clientes.find(
          (cliente) => cliente.id === a.cliente_id,
        )?.nombre ?? ""

      const clienteB =
        clientes.find(
          (cliente) => cliente.id === b.cliente_id,
        )?.nombre ?? ""

      return `${clienteA}-${a.nombre}`.localeCompare(
        `${clienteB}-${b.nombre}`,
      )
    })
  }, [bodegas, clientes])

  const asignacionesOrdenadas = useMemo(() => {
    return [...asignaciones].sort((a, b) => {
      const clienteA =
        clientes.find(
          (cliente) => cliente.id === a.cliente_id,
        )?.nombre ?? ""

      const clienteB =
        clientes.find(
          (cliente) => cliente.id === b.cliente_id,
        )?.nombre ?? ""

      return clienteA.localeCompare(clienteB)
    })
  }, [asignaciones, clientes])

  if (cargando) {
    return (
      <div style={pagina}>
        <h1>Administración</h1>
        <p>Cargando catálogos...</p>
      </div>
    )
  }

  return (
    <div style={pagina}>
      <div style={cabeceraPagina}>
        <div>
          <span style={etiquetaPagina}>
            CONFIGURACIÓN Y MAESTROS
          </span>

          <h1 style={tituloPagina}>
            Administración
          </h1>

          <p style={subtituloPagina}>
            Gestiona los catálogos, costos y
            parámetros centrales de CIBUSPAN ONE.
          </p>
        </div>
      </div>

      <div style={areas}>
        <button
          type="button"
          onClick={() => setArea("CATALOGOS")}
          style={{
            ...botonArea,
            ...(area === "CATALOGOS"
              ? botonAreaActivo
              : {}),
          }}
        >
          Catálogos
        </button>

        <button
          type="button"
          onClick={() => setArea("COSTOS")}
          style={{
            ...botonArea,
            ...(area === "COSTOS"
              ? botonAreaActivo
              : {}),
          }}
        >
          Costos y formulación
        </button>

        <button
          type="button"
          onClick={() => setArea("SISTEMA")}
          style={{
            ...botonArea,
            ...(area === "SISTEMA"
              ? botonAreaActivo
              : {}),
          }}
        >
          Sistema
        </button>
      </div>

      {area === "CATALOGOS" && (
        <div style={pestanas}>
          <BotonPestana
            texto="Clientes"
            activo={seccion === "CLIENTES"}
            onClick={() => setSeccion("CLIENTES")}
          />

          <BotonPestana
            texto="Bodegas"
            activo={seccion === "BODEGAS"}
            onClick={() => setSeccion("BODEGAS")}
          />

          <BotonPestana
            texto="Productos"
            activo={seccion === "PRODUCTOS"}
            onClick={() => setSeccion("PRODUCTOS")}
          />

          <BotonPestana
            texto="Cliente - Producto"
            activo={seccion === "ASIGNACIONES"}
            onClick={() => setSeccion("ASIGNACIONES")}
          />
        </div>
      )}

      <ModalMensaje
        abierto={mensaje !== ""}
        tipo="EXITO"
        mensaje={mensaje}
        cerrar={() => setMensaje("")}
        cierreAutomaticoMs={2500}
      />

      <ModalMensaje
        abierto={error !== ""}
        tipo="ERROR"
        mensaje={error}
        cerrar={() => setError("")}
      />

      {area === "CATALOGOS" && seccion === "CLIENTES" && (
        <>
          <section style={panel}>
            <h2>Crear cliente</h2>

            <div style={filaFormulario}>
              <input
                value={nuevoCliente}
                onChange={(evento) =>
                  setNuevoCliente(evento.target.value)
                }
                placeholder="Nombre del cliente"
                style={campo}
              />

              <button
                type="button"
                onClick={crearCliente}
                style={botonPrincipal}
              >
                Crear cliente
              </button>
            </div>
          </section>

          <section style={panel}>
            <h2>Clientes registrados</h2>

            <TablaBase
              encabezados={[
                "Cliente",
                "Estado",
                "Acción",
              ]}
            >
              {clientes.map((cliente) => (
                <tr key={cliente.id}>
                  <td style={celda}>
                    <strong>{cliente.nombre}</strong>
                  </td>

                  <td style={celda}>
                    {cliente.activo
                      ? "ACTIVO"
                      : "INACTIVO"}
                  </td>

                  <td style={celda}>
                    <button
                      type="button"
                      onClick={() =>
                        cambiarCliente(cliente)
                      }
                      style={botonSecundario}
                    >
                      {cliente.activo
                        ? "Desactivar"
                        : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </TablaBase>
          </section>
        </>
      )}

      {area === "CATALOGOS" && seccion === "BODEGAS" && (
        <>
          <section style={panel}>
            <h2>Crear bodega</h2>

            <div style={formularioGrid}>
              <div>
                <label>Cliente</label>

                <select
                  value={bodegaClienteId}
                  onChange={(evento) =>
                    setBodegaClienteId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {clientes
                    .filter(
                      (cliente) => cliente.activo,
                    )
                    .map((cliente) => (
                      <option
                        key={cliente.id}
                        value={cliente.id}
                      >
                        {cliente.nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label>Nombre de bodega</label>

                <input
                  value={nombreBodega}
                  onChange={(evento) =>
                    setNombreBodega(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Tipo de empaque</label>

                <input
                  value={tipoEmpaque}
                  onChange={(evento) =>
                    setTipoEmpaque(
                      evento.target.value,
                    )
                  }
                  placeholder="GAVETA SUPER, CAJA..."
                  style={campo}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={crearBodega}
              style={botonPrincipal}
            >
              Crear bodega
            </button>
          </section>

          <section style={panel}>
            <h2>Bodegas registradas</h2>

            <TablaBase
              encabezados={[
                "Cliente",
                "Bodega",
                "Empaque",
                "Estado",
                "Acción",
              ]}
            >
              {bodegasOrdenadas.map((bodega) => {
                const cliente =
                  clientes.find(
                    (item) =>
                      item.id === bodega.cliente_id,
                  )

                return (
                  <tr key={bodega.id}>
                    <td style={celda}>
                      {cliente?.nombre ?? ""}
                    </td>

                    <td style={celda}>
                      <strong>{bodega.nombre}</strong>
                    </td>

                    <td style={celda}>
                      {bodega.tipo_empaque}
                    </td>

                    <td style={celda}>
                      {bodega.activo
                        ? "ACTIVA"
                        : "INACTIVA"}
                    </td>

                    <td style={celda}>
                      <button
                        type="button"
                        onClick={() =>
                          cambiarBodega(bodega)
                        }
                        style={botonSecundario}
                      >
                        {bodega.activo
                          ? "Desactivar"
                          : "Activar"}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </TablaBase>
          </section>
        </>
      )}

      {area === "CATALOGOS" && seccion === "PRODUCTOS" && (
        <>
          <section style={panel}>
            <h2>Crear producto</h2>

            <div style={formularioGrid}>
              <div>
                <label>Código</label>

                <input
                  value={codigoProducto}
                  onChange={(evento) =>
                    setCodigoProducto(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Nombre completo</label>

                <input
                  value={nombreProducto}
                  onChange={(evento) =>
                    setNombreProducto(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Nombre corto</label>

                <input
                  value={cortoProducto}
                  onChange={(evento) =>
                    setCortoProducto(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Tamaño lote</label>

                <input
                  type="number"
                  min="1"
                  value={loteProduccion}
                  onChange={(evento) =>
                    setLoteProduccion(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Stock de seguridad</label>

                <input
                  type="number"
                  min="0"
                  value={stockSeguridad}
                  onChange={(evento) =>
                    setStockSeguridad(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Vida útil (días)</label>

                <input
                  type="number"
                  min="1"
                  value={vidaUtil}
                  onChange={(evento) =>
                    setVidaUtil(evento.target.value)
                  }
                  style={campo}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={crearProducto}
              style={botonPrincipal}
            >
              Crear producto
            </button>
          </section>

          <section style={panel}>
            <h2>Productos registrados</h2>

            <TablaBase
              encabezados={[
                "Código",
                "Producto",
                "Corto",
                "Lote",
                "Stock seguridad",
                "Vida útil",
                "Estado",
                "Acción",
              ]}
            >
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td style={celda}>
                    {producto.codigo}
                  </td>

                  <td style={celda}>
                    {producto.nombre}
                  </td>

                  <td style={celda}>
                    <strong>{producto.corto}</strong>
                  </td>

                  <td style={celda}>
                    {producto.lote_produccion}
                  </td>

                  <td style={celda}>
                    {producto.stock_seguridad}
                  </td>

                  <td style={celda}>
                    {producto.vida_util_dias} días
                  </td>

                  <td style={celda}>
                    {producto.activo
                      ? "ACTIVO"
                      : "INACTIVO"}
                  </td>

                  <td style={celda}>
                    <button
                      type="button"
                      onClick={() =>
                        cambiarProducto(producto)
                      }
                      style={botonSecundario}
                    >
                      {producto.activo
                        ? "Desactivar"
                        : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </TablaBase>
          </section>
        </>
      )}

      {area === "CATALOGOS" && seccion === "ASIGNACIONES" && (
        <>
          <section style={panel}>
            <h2>Asignar producto a cliente</h2>

            <div style={formularioGrid}>
              <div>
                <label>Cliente</label>

                <select
                  value={asignacionClienteId}
                  onChange={(evento) =>
                    setAsignacionClienteId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {clientes
                    .filter(
                      (cliente) => cliente.activo,
                    )
                    .map((cliente) => (
                      <option
                        key={cliente.id}
                        value={cliente.id}
                      >
                        {cliente.nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label>Producto</label>

                <select
                  value={asignacionProductoId}
                  onChange={(evento) =>
                    setAsignacionProductoId(
                      evento.target.value,
                    )
                  }
                  style={campo}
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {productos
                    .filter(
                      (producto) => producto.activo,
                    )
                    .map((producto) => (
                      <option
                        key={producto.id}
                        value={producto.id}
                      >
                        {producto.corto} ·{" "}
                        {producto.codigo}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label>Unidad de manejo</label>

                <input
                  type="number"
                  min="1"
                  value={unidadManejo}
                  onChange={(evento) =>
                    setUnidadManejo(
                      evento.target.value,
                    )
                  }
                  style={campo}
                />
              </div>

              <div>
                <label>Precio opcional</label>

                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={precio}
                  onChange={(evento) =>
                    setPrecio(evento.target.value)
                  }
                  style={campo}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={asignarProducto}
              style={botonPrincipal}
            >
              Guardar asignación
            </button>
          </section>

          <section style={panel}>
            <h2>Asignaciones registradas</h2>

            <TablaBase
              encabezados={[
                "Cliente",
                "Producto",
                "Código",
                "Unidad manejo",
                "Precio",
                "Estado",
                "Acción",
              ]}
            >
              {asignacionesOrdenadas.map(
                (asignacion) => {
                  const cliente =
                    clientes.find(
                      (item) =>
                        item.id ===
                        asignacion.cliente_id,
                    )

                  const producto =
                    productos.find(
                      (item) =>
                        item.id ===
                        asignacion.producto_id,
                    )

                  return (
                    <tr key={asignacion.id}>
                      <td style={celda}>
                        {cliente?.nombre ?? ""}
                      </td>

                      <td style={celda}>
                        <strong>
                          {producto?.corto ?? ""}
                        </strong>
                      </td>

                      <td style={celda}>
                        {producto?.codigo ?? ""}
                      </td>

                      <td style={celda}>
                        {asignacion.unidad_manejo}
                      </td>

                      <td style={celda}>
                        {asignacion.precio ?? "-"}
                      </td>

                      <td style={celda}>
                        {asignacion.activo
                          ? "ACTIVA"
                          : "INACTIVA"}
                      </td>

                      <td style={celda}>
                        <button
                          type="button"
                          onClick={() =>
                            cambiarAsignacion(
                              asignacion,
                            )
                          }
                          style={botonSecundario}
                        >
                          {asignacion.activo
                            ? "Desactivar"
                            : "Activar"}
                        </button>
                      </td>
                    </tr>
                  )
                },
              )}
            </TablaBase>
          </section>
        </>
      )}

      {area === "COSTOS" && (
        <section style={modulosGrid}>
          <TarjetaModulo
            titulo="Materias primas y costos"
            descripcion="Catálogo maestro, costos vigentes e historial de importaciones contables."
            accion="Abrir módulo"
            onClick={() =>
              cambiarPantalla("Materias primas")
            }
          />

          <TarjetaModulo
            titulo="Fórmulas"
            descripcion="Fórmulas de SKU y micros con cantidades, porcentajes y costos para producción."
            accion="Abrir módulo"
            onClick={() =>
              cambiarPantalla("Preformulación")
            }
          />

          <TarjetaModulo
            titulo="Costos indirectos"
            descripcion="Carga mensual del balance de resultados, historial contable y cálculo preliminar de EBITDA."
            accion="Abrir módulo"
            onClick={() =>
              cambiarPantalla("Costos indirectos")
            }
          />

          <TarjetaModulo
            titulo="Facturas y pagos"
            descripcion="Registra facturas, programa pagos semanales, controla abonos y clasifica las salidas reales de caja."
            accion="Abrir módulo"
            onClick={() =>
              cambiarPantalla("Pagos y gastos")
            }
          />

          <TarjetaModulo
            titulo="Roles de pago"
            descripcion="Carga los roles mensuales, clasifica empleados por área y analiza el costo laboral real."
            accion="Abrir módulo"
            onClick={() =>
              cambiarPantalla("Roles de pago")
            }
          />

          <TarjetaModulo
            titulo="Empaques"
            descripcion="Fundas, etiquetas, clips, cajas y costo de empaque por SKU."
            accion="Próximamente"
            deshabilitado
          />

          <TarjetaModulo
            titulo="Simulador"
            descripcion="Margen bruto por SKU, gastos por cliente y descuento máximo sin bajar del margen objetivo."
            accion="Abrir módulo"
            onClick={() =>
              cambiarPantalla("Simulador")
            }
          />
        </section>
      )}

      {area === "SISTEMA" && (
        <section style={modulosGrid}>
          <TarjetaModulo
            titulo="Parámetros"
            descripcion="Configuraciones generales de producción, inventario y documentos."
            accion="Próximamente"
            deshabilitado
          />

          <TarjetaModulo
            titulo="Usuarios y permisos"
            descripcion={puedeGestionarUsuarios
              ? "Crea usuarios, asigna roles, personaliza accesos y revisa el historial de cambios."
              : "Esta opción está reservada exclusivamente para el administrador."}
            accion={puedeGestionarUsuarios ? "Gestionar usuarios" : "Solo administrador"}
            onClick={puedeGestionarUsuarios
              ? () => cambiarPantalla("Usuarios y permisos")
              : undefined}
            deshabilitado={!puedeGestionarUsuarios}
          />
        </section>
      )}
    </div>
  )
}

type TarjetaModuloProps = {
  titulo: string
  descripcion: string
  accion: string
  onClick?: () => void
  deshabilitado?: boolean
}

function TarjetaModulo({
  titulo,
  descripcion,
  accion,
  onClick,
  deshabilitado = false,
}: TarjetaModuloProps) {
  return (
    <article style={tarjetaModulo}>
      <div>
        <h2 style={tituloModulo}>
          {titulo}
        </h2>

        <p style={descripcionModulo}>
          {descripcion}
        </p>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={deshabilitado}
        style={{
          ...botonModulo,
          opacity: deshabilitado ? 0.5 : 1,
          cursor: deshabilitado
            ? "not-allowed"
            : "pointer",
        }}
      >
        {accion}
      </button>
    </article>
  )
}

type BotonPestanaProps = {
  texto: string
  activo: boolean
  onClick: () => void
}

function BotonPestana({
  texto,
  activo,
  onClick,
}: BotonPestanaProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...botonPestana,
        background: activo
          ? "#8f1d24"
          : "white",
        color: activo ? "white" : "#8f1d24",
      }}
    >
      {texto}
    </button>
  )
}

type TablaBaseProps = {
  encabezados: string[]
  children: React.ReactNode
}

function TablaBase({
  encabezados,
  children,
}: TablaBaseProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tabla}>
        <thead>
          <tr>
            {encabezados.map((encabezado) => (
              <th
                key={encabezado}
                style={encabezadoTabla}
              >
                {encabezado}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const pagina = {
  padding: "30px",
  maxWidth: "1500px",
  margin: "0 auto",
}

const cabeceraPagina = {
  marginBottom: "24px",
}

const etiquetaPagina = {
  color: "#8f1d24",
  fontSize: "12px",
  fontWeight: "bold",
  letterSpacing: "1px",
}

const tituloPagina = {
  margin: "5px 0",
  fontSize: "32px",
}

const subtituloPagina = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.5,
}

const areas = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
  width: "fit-content",
  marginBottom: "20px",
  padding: "6px",
  borderRadius: "10px",
  background: "#e5e7eb",
}

const botonArea = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "#6b7280",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonAreaActivo = {
  background: "#8f1d24",
  color: "white",
  boxShadow:
    "0 2px 8px rgba(15, 23, 42, 0.10)",
}

const modulosGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "18px",
}

const tarjetaModulo = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  gap: "22px",
  minHeight: "210px",
  padding: "22px",
  border: "1px solid #e2e5e9",
  borderRadius: "14px",
  background: "white",
  boxShadow:
    "0 6px 18px rgba(15, 23, 42, 0.05)",
}

const tituloModulo = {
  margin: "0 0 12px",
  color: "#8f1d24",
  fontSize: "21px",
}

const descripcionModulo = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.5,
}

const botonModulo = {
  width: "100%",
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
}

const pestanas = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "10px",
  marginBottom: "24px",
}

const botonPestana = {
  padding: "10px 16px",
  border: "1px solid #8f1d24",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
}

const panel = {
  marginBottom: "24px",
  padding: "22px",
  border: "1px solid #dddddd",
  borderRadius: "12px",
  background: "white",
}

const filaFormulario = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "12px",
  alignItems: "end",
}

const formularioGrid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "16px",
  marginBottom: "18px",
}

const campo = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px",
  marginTop: "6px",
}

const botonPrincipal = {
  padding: "11px 18px",
  border: "none",
  borderRadius: "8px",
  background: "#8f1d24",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const botonSecundario = {
  padding: "8px 12px",
  border: "1px solid #8f1d24",
  borderRadius: "7px",
  background: "white",
  color: "#8f1d24",
  cursor: "pointer",
}

const mensajeExito = {
  padding: "12px",
  borderRadius: "8px",
  background: "#dcfce7",
  color: "#166534",
}

const mensajeError = {
  padding: "12px",
  borderRadius: "8px",
  background: "#fee2e2",
  color: "#991b1b",
}

const tabla = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const encabezadoTabla = {
  padding: "10px",
  textAlign: "left" as const,
  borderBottom: "2px solid #cccccc",
  whiteSpace: "nowrap" as const,
}

const celda = {
  padding: "10px",
  borderBottom: "1px solid #eeeeee",
  whiteSpace: "nowrap" as const,
}
