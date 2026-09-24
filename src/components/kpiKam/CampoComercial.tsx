import { useCallback, useEffect, useMemo, useState } from "react"
import {
  analizarCapturasFavorita,
  guardarVisitaCampo,
  obtenerCatalogoCampoComercial,
  subirImagenesCampo,
  type CatalogoCampoComercial,
  type LecturaFavorita,
  type PresenciaPercha,
} from "../../repositories/campoComercialRepository"
import KpiKamCobertura from "./KpiKamCobertura"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  onActualizado: () => void
  soloCampo?: boolean
}

const LECTURA_VACIA: LecturaFavorita = {
  local_nombre: null,
  codigo_barras: null,
  codigo_referencia: null,
  nombre_producto: null,
  fecha_fuente: null,
  precio_comercio: null,
  precio_afiliado: null,
  rotacion_diaria_unidades: null,
  venta_diaria_valor: null,
  prediccion_venta_unidades: null,
  participacion_clase: null,
  participacion_subclase: null,
  stock_local_unidades: null,
  dias_inventario_local: null,
  stock_cd_cajas: null,
  unidades_por_caja: null,
  dias_inventario_cd: null,
  fecha_ultimo_pedido: null,
  cantidad_ultimo_pedido: null,
  fecha_ultimo_despacho: null,
  cantidad_ultimo_despacho: null,
  confianza: 0,
  advertencias: [],
}

const CATALOGO_VACIO: CatalogoCampoComercial = {
  rol: "",
  puede_administrar: false,
  clientes: [],
  locales: [],
  productos: [],
  resumen: {
    locales_visitados: 0,
    posiciones_revisadas: 0,
    codificadas: 0,
    presentes_percha: 0,
    quiebres_stock: 0,
    rotacion_diaria_promedio: null,
    dias_inventario_promedio: null,
  },
  registros: [],
}

export default function CampoComercial({
  periodo,
  cambiarPeriodo,
  onActualizado,
  soloCampo = false,
}: Props) {
  const semana = useMemo(() => semanaActual(), [])
  const [vista, setVista] = useState<"REGISTRO" | "DASHBOARD" | "ADMIN">("REGISTRO")
  const [catalogo, setCatalogo] = useState(CATALOGO_VACIO)
  const [clienteId, setClienteId] = useState("")
  const [localId, setLocalId] = useState("")
  const [productoId, setProductoId] = useState("")
  const [fechaVisita, setFechaVisita] = useState(fechaHoy())
  const [capturas, setCapturas] = useState<File[]>([])
  const [fotosPercha, setFotosPercha] = useState<File[]>([])
  const [rutasCapturas, setRutasCapturas] = useState<string[]>([])
  const [lectura, setLectura] = useState<LecturaFavorita>(LECTURA_VACIA)
  const [codificado, setCodificado] = useState<boolean | null>(null)
  const [presencia, setPresencia] = useState<PresenciaPercha>("NO_REVISADO")
  const [observaciones, setObservaciones] = useState("")
  const [ubicacion, setUbicacion] = useState<{ latitud: number; longitud: number; precision: number } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    try {
      const datos = await obtenerCatalogoCampoComercial(
        clienteId || null,
        semana.desde,
        semana.hasta,
      )
      setCatalogo(datos)
      if (!clienteId && datos.clientes.length === 1) setClienteId(datos.clientes[0].id)
    } catch (err) {
      setCatalogo(CATALOGO_VACIO)
      setError(err instanceof Error ? err.message : "No se pudo cargar la pantalla de campo.")
    } finally {
      setCargando(false)
    }
  }, [clienteId, semana.desde, semana.hasta])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    if (!catalogo.locales.some((local) => local.id === localId)) setLocalId("")
  }, [catalogo.locales, localId])

  const productosOrdenados = useMemo(() => [...catalogo.productos].sort((a, b) => {
    if (a.autorizado !== b.autorizado) return a.autorizado ? -1 : 1
    return a.nombre.localeCompare(b.nombre, "es")
  }), [catalogo.productos])
  const vistasCapturas = useMemo(
    () => capturas.map((archivo) => ({
      archivo,
      url: URL.createObjectURL(archivo),
    })),
    [capturas],
  )

  useEffect(() => () => {
    vistasCapturas.forEach((vista) => URL.revokeObjectURL(vista.url))
  }, [vistasCapturas])

  function seleccionarCapturas(event: React.ChangeEvent<HTMLInputElement>) {
    const nuevas = Array.from(event.target.files ?? [])
    event.target.value = ""
    setCapturas((actuales) => {
      const archivos = [...actuales]
      for (const archivo of nuevas) {
        const repetido = archivos.some((item) =>
          item.name === archivo.name &&
          item.size === archivo.size &&
          item.lastModified === archivo.lastModified
        )
        if (!repetido && archivos.length < 3) archivos.push(archivo)
      }
      return archivos
    })
    setRutasCapturas([])
    setLectura(LECTURA_VACIA)
    setCodificado(null)
    setMensaje("")
    setError("")
  }

  function limpiarCapturas() {
    setCapturas([])
    setRutasCapturas([])
    setLectura(LECTURA_VACIA)
    setCodificado(null)
    setMensaje("")
    setError("")
  }

  async function analizar() {
    if (!clienteId || capturas.length === 0) {
      setError("Selecciona el cliente y entre una y tres capturas de Favorita.")
      return
    }
    setProcesando(true)
    setError("")
    setMensaje("")
    try {
      const rutas = rutasCapturas.length > 0
        ? rutasCapturas
        : await subirImagenesCampo(capturas, "captura")
      setRutasCapturas(rutas)
      const resultado = await analizarCapturasFavorita(rutas)
      setLectura(resultado)
      setCodificado(true)
      sugerirLocalYProducto(resultado)
      setMensaje("Lectura terminada. Revisa los valores antes de guardar.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron analizar las capturas.")
    } finally {
      setProcesando(false)
    }
  }

  function sugerirLocalYProducto(resultado: LecturaFavorita) {
    const localTexto = normalizar(resultado.local_nombre)
    if (localTexto) {
      const local = catalogo.locales.find((item) => {
        const nombre = normalizar(item.nombre)
        return nombre.includes(localTexto) || localTexto.includes(nombre)
      })
      if (local) setLocalId(local.id)
    }
    const codigo = normalizarCodigo(resultado.codigo_barras || resultado.codigo_referencia)
    if (codigo) {
      const producto = catalogo.productos.find((item) => normalizarCodigo(item.codigo) === codigo)
      if (producto) setProductoId(producto.id)
    }
  }

  function obtenerUbicacion() {
    setError("")
    if (!navigator.geolocation) {
      setError("Este dispositivo no permite obtener ubicación.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) => setUbicacion({
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
        precision: posicion.coords.accuracy,
      }),
      () => setError("No fue posible obtener la ubicación. Puedes continuar sin ella."),
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  async function guardar() {
    if (!clienteId || !localId || !productoId) {
      setError("Selecciona cliente, local y SKU.")
      return
    }
    if (rutasCapturas.length === 0) {
      setError("Primero analiza las capturas de Favorita.")
      return
    }
    setGuardando(true)
    setError("")
    setMensaje("")
    try {
      const rutasPercha = fotosPercha.length > 0
        ? await subirImagenesCampo(fotosPercha.slice(0, 3), "percha")
        : []
      await guardarVisitaCampo({
        cliente_id: clienteId,
        local_id: localId,
        producto_id: productoId,
        fecha_visita: fechaVisita,
        visitado_en: new Date().toISOString(),
        latitud: ubicacion?.latitud ?? null,
        longitud: ubicacion?.longitud ?? null,
        precision_metros: ubicacion?.precision ?? null,
        codificado_app: codificado,
        presencia_percha: presencia,
        capturas_app: rutasCapturas,
        fotos_percha: rutasPercha,
        observaciones: observaciones || null,
        observaciones_sku: observaciones || null,
        confianza_ia: lectura.confianza || null,
        datos_ia: lectura,
        ...lectura,
        nombre_reportado: lectura.nombre_producto,
        codigo_barras: lectura.codigo_barras || lectura.codigo_referencia,
      })
      setMensaje("Visita guardada. Puedes registrar el siguiente SKU del mismo local.")
      setProductoId("")
      setCapturas([])
      setFotosPercha([])
      setRutasCapturas([])
      setLectura(LECTURA_VACIA)
      setCodificado(null)
      setPresencia("NO_REVISADO")
      setObservaciones("")
      await cargar()
      onActualizado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la visita.")
    } finally {
      setGuardando(false)
    }
  }

  if (cargando && catalogo.clientes.length === 0) {
    return <div className="campo-carga">Cargando trabajo de campo…</div>
  }

  return (
    <section className={`campo-comercial ${soloCampo ? "campo-solo" : ""}`}>
      <style>{css}</style>
      <header className="campo-head">
        <div>
          <span>GESTIÓN EN PUNTO DE VENTA</span>
          <h2>Cobertura y rotación</h2>
          <p>Captura la información del local y revisa el resultado semanal.</p>
        </div>
        <nav>
          <button className={vista === "REGISTRO" ? "activo" : ""} onClick={() => setVista("REGISTRO")}>Registrar visita</button>
          <button className={vista === "DASHBOARD" ? "activo" : ""} onClick={() => setVista("DASHBOARD")}>Dashboard semanal</button>
          {!soloCampo && catalogo.puede_administrar && <button className={vista === "ADMIN" ? "activo" : ""} onClick={() => setVista("ADMIN")}>Locales y reportes</button>}
        </nav>
      </header>

      {error && <div className="campo-error">{error}</div>}
      {mensaje && <div className="campo-exito">{mensaje}</div>}

      {vista === "ADMIN" && !soloCampo ? (
        <KpiKamCobertura periodo={periodo} cambiarPeriodo={cambiarPeriodo} onActualizado={onActualizado} />
      ) : vista === "DASHBOARD" ? (
        <DashboardCampo catalogo={catalogo} clienteId={clienteId} setClienteId={setClienteId} semana={semana} />
      ) : (
        <div className="campo-flujo">
          <section className="campo-paso">
            <header><b>1</b><div><span>UBICACIÓN DE LA VISITA</span><h3>¿Dónde estás trabajando?</h3></div></header>
            <div className="campo-grid campo-grid-3">
              <label><span>Cliente</span><select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setLocalId(""); setProductoId("") }}><option value="">Seleccionar cliente</option>{catalogo.clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
              <label><span>Local</span><select value={localId} onChange={(e) => setLocalId(e.target.value)} disabled={!clienteId}><option value="">Seleccionar local</option>{catalogo.locales.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select></label>
              <label><span>Fecha</span><input type="date" value={fechaVisita} onChange={(e) => setFechaVisita(e.target.value)} /></label>
            </div>
            <button type="button" className="campo-ubicacion" onClick={obtenerUbicacion}>{ubicacion ? `✓ Ubicación registrada · ±${Math.round(ubicacion.precision)} m` : "Registrar mi ubicación"}</button>
          </section>

          <section className="campo-paso">
            <header><b>2</b><div><span>CAPTURAS DE FAVORITA</span><h3>Sube de 1 a 3 imágenes del mismo SKU</h3></div></header>
            <label className="campo-captura">
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={seleccionarCapturas} />
              <strong>{capturas.length ? `${capturas.length} de 3 imágenes listas · agregar más` : "Tomar fotos o elegir capturas"}</strong>
              <small>Incluye la cabecera y la parte inferior si la información ocupa dos pantallas.</small>
            </label>
            {vistasCapturas.length > 0 && <><div className="campo-miniaturas">{vistasCapturas.map(({ archivo, url }) => <img key={`${archivo.name}-${archivo.lastModified}`} src={url} alt={archivo.name} />)}</div><button className="campo-limpiar" type="button" onClick={limpiarCapturas}>Quitar imágenes</button></>}
            <button className="campo-principal" type="button" disabled={procesando || capturas.length === 0} onClick={() => void analizar()}>{procesando ? "Leyendo capturas…" : "Leer información automáticamente"}</button>
          </section>

          {rutasCapturas.length > 0 && <section className="campo-paso campo-revision">
            <header><b>3</b><div><span>CONFIRMACIÓN</span><h3>Revisa y corrige antes de guardar</h3></div></header>
            {lectura.advertencias.length > 0 && <div className="campo-advertencia">{lectura.advertencias.join(" · ")}</div>}
            <div className="campo-grid campo-grid-2">
              <label><span>SKU</span><select value={productoId} onChange={(e) => setProductoId(e.target.value)}><option value="">Seleccionar SKU</option>{productosOrdenados.map((item) => <option key={item.id} value={item.id}>{item.autorizado ? "✓" : "+"} {item.nombre} · {item.codigo}</option>)}</select></label>
              <CampoTexto etiqueta="Código de barras" valor={lectura.codigo_barras} cambiar={(valor) => setLectura((actual) => ({ ...actual, codigo_barras: valor }))} />
              <CampoNumero etiqueta="Rotación diaria (unidades)" valor={lectura.rotacion_diaria_unidades} cambiar={(valor) => setLectura((actual) => ({ ...actual, rotacion_diaria_unidades: valor }))} />
              <CampoNumero etiqueta="Stock en local" valor={lectura.stock_local_unidades} cambiar={(valor) => setLectura((actual) => ({ ...actual, stock_local_unidades: valor }))} />
              <CampoNumero etiqueta="Días de inventario local" valor={lectura.dias_inventario_local} cambiar={(valor) => setLectura((actual) => ({ ...actual, dias_inventario_local: valor }))} />
              <CampoNumero etiqueta="Venta diaria ($)" valor={lectura.venta_diaria_valor} cambiar={(valor) => setLectura((actual) => ({ ...actual, venta_diaria_valor: valor }))} />
              <CampoNumero etiqueta="Precio comercio" valor={lectura.precio_comercio} cambiar={(valor) => setLectura((actual) => ({ ...actual, precio_comercio: valor }))} />
              <CampoNumero etiqueta="Precio afiliado" valor={lectura.precio_afiliado} cambiar={(valor) => setLectura((actual) => ({ ...actual, precio_afiliado: valor }))} />
              <CampoNumero etiqueta="Stock CD (cajas)" valor={lectura.stock_cd_cajas} cambiar={(valor) => setLectura((actual) => ({ ...actual, stock_cd_cajas: valor }))} />
              <CampoNumero etiqueta="Último despacho (unidades)" valor={lectura.cantidad_ultimo_despacho} cambiar={(valor) => setLectura((actual) => ({ ...actual, cantidad_ultimo_despacho: valor }))} />
            </div>
            <div className="campo-estados">
              <fieldset><legend>¿Está codificado en la app?</legend><button type="button" className={codificado === true ? "si activo" : "si"} onClick={() => setCodificado(true)}>Sí</button><button type="button" className={codificado === false ? "no activo" : "no"} onClick={() => setCodificado(false)}>No</button></fieldset>
              <fieldset><legend>¿Está físicamente en percha?</legend>{(["PRESENTE", "AUSENTE", "NO_REVISADO"] as PresenciaPercha[]).map((item) => <button type="button" key={item} className={presencia === item ? "activo" : ""} onClick={() => setPresencia(item)}>{item === "PRESENTE" ? "Sí" : item === "AUSENTE" ? "No" : "Sin revisar"}</button>)}</fieldset>
            </div>
            <label className="campo-foto-percha"><span>Fotos de percha (opcionales)</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => setFotosPercha(Array.from(e.target.files ?? []).slice(0, 3))} /><small>{fotosPercha.length ? `${fotosPercha.length} foto(s) lista(s)` : "Sirven como evidencia de presencia, ausencia o ubicación."}</small></label>
            <label className="campo-observaciones"><span>Observaciones</span><textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ubicación en percha, faltante, novedad, gestión realizada…" /></label>
            <button className="campo-guardar" type="button" disabled={guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar visita y actualizar indicadores"}</button>
          </section>}
        </div>
      )}
    </section>
  )
}

function DashboardCampo({ catalogo, clienteId, setClienteId, semana }: {
  catalogo: CatalogoCampoComercial
  clienteId: string
  setClienteId: (valor: string) => void
  semana: { desde: string; hasta: string }
}) {
  const r = catalogo.resumen
  const cobertura = r.posiciones_revisadas > 0 ? r.codificadas / r.posiciones_revisadas * 100 : null
  return <section className="campo-dashboard">
    <div className="campo-dashboard-filtro"><div><span>SEMANA</span><strong>{fechaCorta(semana.desde)} – {fechaCorta(semana.hasta)}</strong></div><label><span>Cliente</span><select value={clienteId} onChange={(e) => setClienteId(e.target.value)}><option value="">Todos los clientes</option>{catalogo.clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label></div>
    <div className="campo-cards">
      <Tarjeta titulo="Locales visitados" valor={String(r.locales_visitados)} detalle="Locales con registro esta semana" tono="vino" />
      <Tarjeta titulo="Cobertura verificada" valor={cobertura == null ? "—" : `${cobertura.toFixed(1)}%`} detalle={`${r.codificadas} de ${r.posiciones_revisadas} posiciones`} tono="verde" />
      <Tarjeta titulo="Rotación diaria" valor={r.rotacion_diaria_promedio == null ? "—" : r.rotacion_diaria_promedio.toFixed(2)} detalle="Unidades promedio por día" tono="naranja" />
      <Tarjeta titulo="Quiebres de stock" valor={String(r.quiebres_stock)} detalle="Registros con stock local en cero" tono={r.quiebres_stock > 0 ? "rojo" : "verde"} />
      <Tarjeta titulo="Presencia en percha" valor={String(r.presentes_percha)} detalle="Posiciones verificadas físicamente" tono="azul" />
      <Tarjeta titulo="Inventario local" valor={r.dias_inventario_promedio == null ? "—" : `${r.dias_inventario_promedio.toFixed(1)} días`} detalle="Promedio de días disponibles" tono="gris" />
    </div>
    <div className="campo-registros"><header><div><span>ÚLTIMAS REVISIONES</span><h3>Detalle semanal</h3></div><small>{catalogo.registros.length} registros</small></header>{catalogo.registros.length === 0 ? <p>No hay visitas confirmadas en esta semana.</p> : catalogo.registros.map((item) => <article key={item.id}><div><strong>{item.local_nombre}</strong><span>{item.producto_nombre}</span><small>{fechaCorta(item.fecha)}</small></div><div><b>{item.rotacion_diaria_unidades == null ? "—" : `${item.rotacion_diaria_unidades} u/día`}</b><span>Stock: {item.stock_local_unidades ?? "—"}</span></div><i className={item.codificado_app ? "ok" : "alerta"}>{item.codificado_app ? "Codificado" : "No codificado"}</i></article>)}</div>
  </section>
}

function Tarjeta({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle: string; tono: string }) {
  return <article className={`campo-card ${tono}`}><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>
}

function CampoNumero({ etiqueta, valor, cambiar }: { etiqueta: string; valor: number | null; cambiar: (valor: number | null) => void }) {
  return <label><span>{etiqueta}</span><input type="number" step="0.01" value={valor ?? ""} onChange={(e) => cambiar(e.target.value === "" ? null : Number(e.target.value))} /></label>
}

function CampoTexto({ etiqueta, valor, cambiar }: { etiqueta: string; valor: string | null; cambiar: (valor: string | null) => void }) {
  return <label><span>{etiqueta}</span><input value={valor ?? ""} onChange={(e) => cambiar(e.target.value || null)} /></label>
}

function fechaHoy() {
  const fecha = new Date()
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function semanaActual() {
  const hoyTexto = fechaHoy()
  const hoy = new Date(`${hoyTexto}T12:00:00`)
  const dia = hoy.getDay() || 7
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - dia + 1)
  return { desde: lunes.toISOString().slice(0, 10), hasta: hoyTexto }
}

function fechaCorta(valor: string) {
  const [anio, mes, dia] = valor.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

function normalizar(valor: string | null) {
  return (valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim()
}

function normalizarCodigo(valor: string | null) {
  return (valor ?? "").replace(/[^0-9A-Z]/gi, "").toUpperCase()
}

const css = `
.campo-comercial{display:grid;gap:14px;color:#332824}.campo-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:20px;border:1px solid #e5d9d2;border-radius:15px;background:#fff}.campo-head>div>span,.campo-paso header span,.campo-dashboard-filtro span,.campo-registros header span{color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.09em}.campo-head h2{margin:4px 0;color:#8f1d24;font-size:27px}.campo-head p{margin:0;color:#776a65}.campo-head nav{display:flex;gap:7px;flex-wrap:wrap}.campo-head button,.campo-comercial button{border:1px solid #dfd2cc;border-radius:10px;background:#fff;color:#7a302f;padding:10px 13px;font-weight:900;cursor:pointer}.campo-head button.activo,.campo-principal,.campo-guardar{border-color:#981f28!important;background:#981f28!important;color:#fff!important}.campo-error,.campo-exito,.campo-carga{padding:14px 16px;border:1px solid #ecc7ca;border-radius:12px;background:#fff4f5;color:#a21f29}.campo-exito{border-color:#c5e6d1;background:#eef9f2;color:#147542}.campo-flujo{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;max-width:940px;margin:0 auto;width:100%}.campo-paso{padding:18px;border:1px solid #e6dad4;border-radius:15px;background:#fff}.campo-paso>header{display:flex;gap:12px;align-items:center;margin-bottom:16px}.campo-paso>header>b{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#981f28;color:#fff;font-size:18px}.campo-paso h3{margin:3px 0;color:#7e1e24;font-size:21px}.campo-grid{display:grid;gap:10px}.campo-grid-3{grid-template-columns:1fr 1.4fr .75fr}.campo-grid-2{grid-template-columns:1fr 1fr}.campo-comercial label{display:grid;gap:6px}.campo-comercial label>span,.campo-estados legend{color:#6f605b;font-size:10px;font-weight:900;text-transform:uppercase}.campo-comercial input,.campo-comercial select,.campo-comercial textarea{box-sizing:border-box;width:100%;border:1px solid #daccc5;border-radius:10px;background:#fbfaf8;padding:12px;color:#352a27;font:inherit;font-weight:700}.campo-comercial textarea{min-height:90px;resize:vertical}.campo-ubicacion{margin-top:11px!important;background:#fff8ef!important;color:#9a5b0d!important;border-color:#edcf9e!important}.campo-captura{place-items:center;padding:26px 18px;border:2px dashed #d7beb5;border-radius:14px;background:#fffaf7;text-align:center;cursor:pointer}.campo-captura input{position:absolute;opacity:0;pointer-events:none}.campo-captura strong{color:#8f1d24;font-size:17px}.campo-captura small{color:#80736e}.campo-miniaturas{display:flex;gap:8px;overflow:auto;margin:12px 0}.campo-miniaturas img{width:92px;height:128px;object-fit:cover;border:1px solid #ded0c9;border-radius:10px}.campo-principal,.campo-guardar{width:100%;margin-top:12px;font-size:15px}.campo-comercial button:disabled{opacity:.55;cursor:wait}.campo-advertencia{margin-bottom:12px;padding:10px;border-radius:9px;background:#fff2dc;color:#925b13}.campo-estados{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:13px}.campo-estados fieldset{display:flex;gap:7px;flex-wrap:wrap;margin:0;padding:12px;border:1px solid #e3d7d0;border-radius:11px}.campo-estados legend{padding:0 5px}.campo-estados button.activo,.campo-estados button.si.activo{background:#18864b;color:#fff;border-color:#18864b}.campo-estados button.no.activo{background:#aa2630;color:#fff;border-color:#aa2630}.campo-foto-percha,.campo-observaciones{margin-top:13px}.campo-foto-percha small{color:#80736e}.campo-dashboard{display:grid;gap:14px}.campo-dashboard-filtro{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:15px 18px;border:1px solid #e6dad4;border-radius:13px;background:#fff}.campo-dashboard-filtro>div{display:grid;gap:4px}.campo-dashboard-filtro label{min-width:290px}.campo-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.campo-card{display:grid;gap:8px;min-height:120px;padding:17px;border:1px solid #e5dad4;border-top:5px solid #8f1d24;border-radius:13px;background:#fff}.campo-card span{font-size:11px;font-weight:900;text-transform:uppercase;color:#6d5e59}.campo-card strong{font-size:29px;color:#8f1d24}.campo-card small{color:#827570}.campo-card.verde{border-top-color:#18864b}.campo-card.verde strong{color:#18864b}.campo-card.naranja{border-top-color:#ed8c18}.campo-card.rojo{border-top-color:#aa2630}.campo-card.azul{border-top-color:#3679a6}.campo-card.gris{border-top-color:#8e827c}.campo-registros{border:1px solid #e5dad4;border-radius:14px;background:#fff;overflow:hidden}.campo-registros>header{display:flex;justify-content:space-between;align-items:end;padding:16px}.campo-registros h3{margin:3px 0;color:#8f1d24}.campo-registros>p{padding:20px;text-align:center;color:#817570}.campo-registros article{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;padding:13px 16px;border-top:1px solid #eee5e0}.campo-registros article div{display:grid;gap:3px}.campo-registros article span,.campo-registros article small{color:#817570;font-size:11px}.campo-registros article i{padding:6px 9px;border-radius:99px;background:#fdebed;color:#a5242d;font-size:10px;font-style:normal;font-weight:900}.campo-registros article i.ok{background:#e7f6ed;color:#147542}
@media(max-width:800px){.campo-head{align-items:stretch;display:grid;padding:16px}.campo-head nav{display:grid;grid-template-columns:1fr 1fr}.campo-head nav button:last-child:nth-child(3){grid-column:1/-1}.campo-grid-3,.campo-grid-2,.campo-estados,.campo-cards{grid-template-columns:1fr}.campo-paso{padding:15px}.campo-dashboard-filtro{align-items:stretch;display:grid}.campo-dashboard-filtro label{min-width:0}.campo-registros article{grid-template-columns:1fr auto}.campo-registros article i{grid-column:1/-1;justify-self:start}.campo-flujo{max-width:none}.campo-head h2{font-size:24px}.campo-paso h3{font-size:18px}}
`
