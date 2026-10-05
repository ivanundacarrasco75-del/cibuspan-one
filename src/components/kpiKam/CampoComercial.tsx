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
import {
  guardarArchivosCampo,
  leerArchivosCampo,
  limpiarArchivosCampo,
} from "../../utils/borradorCampoComercial"
import KpiKamCobertura from "./KpiKamCobertura"
import SupervisionCampo from "./SupervisionCampo"
import { crearVisitaCampo, registrarSkuEnVisita, type VisitaActivaCampo } from "../../utils/visitaActivaCampo"

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
    sin_perchar_con_stock: 0,
    rotacion_diaria_promedio: null,
    dias_inventario_promedio: null,
  },
  registros: [],
}

type VistaCampo = "REGISTRO" | "DASHBOARD" | "SUPERVISION" | "ADMIN"

type BorradorCampo = {
  visitaActiva?: VisitaActivaCampo | null
  vista?: VistaCampo
  clienteId?: string
  localId?: string
  productoId?: string
  fechaVisita?: string
  rutasCapturas?: string[]
  lectura?: LecturaFavorita
  lecturaConfirmada?: boolean
  codificado?: boolean | null
  presencia?: PresenciaPercha
  carasPercha?: number | null
  observaciones?: string
  ubicacion?: { latitud: number; longitud: number; precision: number } | null
}

const CLAVE_BORRADOR_CAMPO = "cibuspan-one:campo-comercial:borrador:v1"

function leerBorradorCampo(): BorradorCampo {
  try {
    return JSON.parse(window.localStorage.getItem(CLAVE_BORRADOR_CAMPO) || "{}")
  } catch {
    return {}
  }
}

export default function CampoComercial({
  periodo,
  cambiarPeriodo,
  onActualizado,
  soloCampo = false,
}: Props) {
  const semana = useMemo(() => semanaActual(), [])
  const [borradorInicial] = useState<BorradorCampo>(leerBorradorCampo)
  const [vista, setVista] = useState<VistaCampo>(borradorInicial.vista ?? "REGISTRO")
  const [catalogo, setCatalogo] = useState(CATALOGO_VACIO)
  const [visitaActiva, setVisitaActiva] = useState<VisitaActivaCampo | null>(borradorInicial.visitaActiva ?? null)
  const [clienteId, setClienteId] = useState(borradorInicial.clienteId ?? "")
  const [localId, setLocalId] = useState(borradorInicial.localId ?? "")
  const [productoId, setProductoId] = useState(borradorInicial.productoId ?? "")
  const [fechaVisita, setFechaVisita] = useState(borradorInicial.visitaActiva || borradorInicial.lecturaConfirmada ? borradorInicial.fechaVisita ?? fechaHoy() : fechaHoy())
  const [capturas, setCapturas] = useState<File[]>([])
  const [fotosPercha, setFotosPercha] = useState<File[]>([])
  const [rutasCapturas, setRutasCapturas] = useState<string[]>(borradorInicial.rutasCapturas ?? [])
  const [lectura, setLectura] = useState<LecturaFavorita>({
    ...LECTURA_VACIA,
    ...borradorInicial.lectura,
  })
  const [lecturaConfirmada, setLecturaConfirmada] = useState(borradorInicial.lecturaConfirmada ?? false)
  const [codificado, setCodificado] = useState<boolean | null>(borradorInicial.codificado ?? null)
  const [presencia, setPresencia] = useState<PresenciaPercha>(borradorInicial.presencia ?? "NO_REVISADO")
  const [carasPercha, setCarasPercha] = useState<number | null>(borradorInicial.carasPercha ?? null)
  const [observaciones, setObservaciones] = useState(borradorInicial.observaciones ?? "")
  const [ubicacion, setUbicacion] = useState<{ latitud: number; longitud: number; precision: number } | null>(borradorInicial.ubicacion ?? null)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [progresoLectura, setProgresoLectura] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [ubicando, setUbicando] = useState(false)
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    try {
      const borrador: BorradorCampo = {
        visitaActiva,
        vista,
        clienteId,
        localId,
        productoId,
        fechaVisita,
        rutasCapturas,
        lectura,
        lecturaConfirmada,
        codificado,
        presencia,
        carasPercha,
        observaciones,
        ubicacion,
      }
      window.localStorage.setItem(CLAVE_BORRADOR_CAMPO, JSON.stringify(borrador))
    } catch {
      // La visita sigue operativa aunque el navegador bloquee el almacenamiento.
    }
  }, [
    clienteId,
    codificado,
    fechaVisita,
    lectura,
    lecturaConfirmada,
    localId,
    observaciones,
    presencia,
    carasPercha,
    productoId,
    rutasCapturas,
    ubicacion,
    vista,
    visitaActiva,
  ])

  useEffect(() => {
    let activo = true
    void Promise.all([
      leerArchivosCampo("capturas"),
      leerArchivosCampo("percha"),
    ]).then(([capturasGuardadas, fotosGuardadas]) => {
      if (!activo) return
      setCapturas(capturasGuardadas)
      setFotosPercha(fotosGuardadas)
    }).catch(() => undefined)
    return () => { activo = false }
  }, [])

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
    if (!visitaActiva && !cargando && !catalogo.locales.some((local) => local.id === localId)) setLocalId("")
  }, [cargando, catalogo.locales, localId, visitaActiva])

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
    const archivos = [...capturas]
    for (const archivo of nuevas) {
      const repetido = archivos.some((item) =>
        item.name === archivo.name &&
        item.size === archivo.size &&
        item.lastModified === archivo.lastModified
      )
      if (!repetido && archivos.length < 3) archivos.push(archivo)
    }
    setCapturas(archivos)
    void guardarArchivosCampo("capturas", archivos).catch(() => undefined)
    setRutasCapturas([])
    setLectura(LECTURA_VACIA)
    setLecturaConfirmada(false)
    setCodificado(null)
    setMensaje("")
    setError("")
  }

  function limpiarCapturas() {
    setCapturas([])
    void guardarArchivosCampo("capturas", []).catch(() => undefined)
    setRutasCapturas([])
    setLectura(LECTURA_VACIA)
    setLecturaConfirmada(false)
    setCodificado(null)
    setMensaje("")
    setError("")
  }

  function seleccionarFotosPercha(event: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(event.target.files ?? []).slice(0, 3)
    event.target.value = ""
    setFotosPercha(archivos)
    void guardarArchivosCampo("percha", archivos).catch(() => undefined)
  }

  async function analizar() {
    if (!visitaActiva || !productoId || capturas.length === 0) {
      setError("Inicia la visita, selecciona el SKU y sube entre una y tres capturas de Favorita.")
      return
    }
    setProcesando(true)
    setProgresoLectura("Preparando lector gratuito…")
    setError("")
    setMensaje("")
    try {
      const rutas = rutasCapturas.length > 0
        ? rutasCapturas
        : await subirImagenesCampo(capturas, "captura")
      setRutasCapturas(rutas)
      const resultado = await analizarCapturasFavorita(
        capturas,
        (porcentaje, texto) => setProgresoLectura(`${texto} ${porcentaje}%`),
      )
      if (!lecturaTieneDatos(resultado)) {
        throw new Error("No se reconocieron datos en las imágenes. Verifica que las capturas estén completas y sean legibles.")
      }
      comprobarCaptura(resultado)
      setLectura(resultado)
      setLecturaConfirmada(true)
      setCodificado(true)
      setMensaje("Lectura terminada. Revisa los valores antes de guardar.")
    } catch (err) {
      setLecturaConfirmada(false)
      setError(err instanceof Error ? err.message : "No se pudieron analizar las capturas.")
    } finally {
      setProcesando(false)
      setProgresoLectura("")
    }
  }

  function comprobarCaptura(resultado: LecturaFavorita) {
    const localTexto = normalizar(resultado.local_nombre)
    if (localTexto) {
      const coincidencias = catalogo.locales.filter((item) => {
        const nombre = normalizar(item.nombre)
        return nombre.includes(localTexto) || localTexto.includes(nombre)
      })
      const local = coincidencias.length === 1 ? coincidencias[0] : null
      if (local && local.id !== visitaActiva?.localId) {
        throw new Error(`La captura corresponde a ${local.nombre}. Revisa las imágenes: la visita activa pertenece a otro local.`)
      }
    }
    const codigo = normalizarCodigo(resultado.codigo_barras || resultado.codigo_referencia)
    if (codigo) {
      const producto = catalogo.productos.find((item) => normalizarCodigo(item.codigo) === codigo)
      if (producto && producto.id !== productoId) {
        throw new Error(`La captura corresponde a ${producto.nombre}, pero seleccionaste otro SKU. Revisa el producto y las imágenes.`)
      }
    }
  }

  function obtenerUbicacion() {
    if (visitaActiva || ubicando) return
    setError("")
    if (!navigator.geolocation) {
      setError("Este dispositivo no permite obtener ubicación.")
      return
    }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setUbicacion({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude, precision: posicion.coords.accuracy })
        setUbicando(false)
      },
      () => { setUbicando(false); setError("No fue posible obtener la ubicación. Puedes continuar sin ella.") },
      { enableHighAccuracy: true, timeout: 12000 },
    )
  }

  function iniciarVisita() {
    try {
      setVisitaActiva(crearVisitaCampo({ clienteId, localId, fecha: fechaVisita, ubicacion }, crypto.randomUUID(), new Date().toISOString()))
      setError("")
      setMensaje("Visita iniciada. Selecciona el primer SKU.")
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo iniciar la visita.") }
  }

  function cambiarContexto(tipo: "cliente" | "local", valor: string) {
    if (visitaActiva) return
    if ((capturas.length || fotosPercha.length || lecturaConfirmada) &&
      !window.confirm("Hay información pendiente de un SKU. ¿Quieres descartarla y cambiar de local?")) return
    limpiarSku()
    setUbicacion(null)
    if (tipo === "cliente") { setClienteId(valor); setLocalId("") }
    else setLocalId(valor)
  }

  function limpiarSku() {
    setProductoId("")
    setCapturas([])
    setFotosPercha([])
    setRutasCapturas([])
    setLectura(LECTURA_VACIA)
    setLecturaConfirmada(false)
    setCodificado(null)
    setPresencia("NO_REVISADO")
    setCarasPercha(null)
    setObservaciones("")
    void limpiarArchivosCampo().catch(() => undefined)
  }

  function cambiarSku(valor: string) {
    if (guardando || procesando) return
    if (valor === productoId) return
    if ((capturas.length || fotosPercha.length || lecturaConfirmada || observaciones || carasPercha !== null) &&
      !window.confirm("Hay información de este SKU sin guardar. ¿Quieres descartarla para elegir otro producto?")) return
    limpiarSku()
    setProductoId(valor)
    setError("")
    setMensaje("")
  }

  function salirSinGuardar() {
    if (guardando || procesando || ubicando) return
    if ((capturas.length || fotosPercha.length || lecturaConfirmada || observaciones || carasPercha !== null || codificado !== null || presencia !== "NO_REVISADO") &&
      !window.confirm("¿Salir y descartar los cambios de este SKU sin guardar? Los SKU que ya guardaste se conservarán.")) return
    const cantidad = visitaActiva?.skusGuardados.length ?? 0
    limpiarSku()
    setVisitaActiva(null)
    setClienteId("")
    setLocalId("")
    setUbicacion(null)
    setFechaVisita(fechaHoy())
    setError("")
    setMensaje(cantidad > 0
      ? `Saliste de la visita. Se conservaron los ${cantidad} SKU guardados. Puedes seleccionar otro cliente o local.`
      : "Saliste sin guardar. Puedes seleccionar otro cliente o local.")
  }

  function finalizarVisita() {
    if (!visitaActiva || guardando || procesando) return
    if ((capturas.length || fotosPercha.length || lecturaConfirmada || observaciones || carasPercha !== null) &&
      !window.confirm("Hay información de un SKU sin guardar. ¿Quieres finalizar y descartar solo esa información pendiente?")) return
    const cantidad = visitaActiva.skusGuardados.length
    limpiarSku()
    setVisitaActiva(null)
    setLocalId("")
    setUbicacion(null)
    setFechaVisita(fechaHoy())
    setError("")
    setMensaje(`Visita finalizada: ${cantidad} SKU guardados. Puedes iniciar la visita al siguiente local.`)
  }

  async function guardar() {
    if (!visitaActiva || !productoId) {
      setError("Inicia una visita y selecciona el SKU.")
      return
    }
    if (visitaActiva.skusGuardados.some((item) => item.id === productoId)) {
      setError("Este SKU ya se guardó en la visita. Selecciona el siguiente.")
      return
    }
    if (rutasCapturas.length === 0) {
      setError("Primero analiza las capturas de Favorita.")
      return
    }
    if (carasPercha !== null && (!Number.isSafeInteger(carasPercha) || carasPercha < 0)) {
      setError("Caras en percha debe ser un número entero desde cero.")
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
        cliente_id: visitaActiva.clienteId,
        local_id: visitaActiva.localId,
        producto_id: productoId,
        fecha_visita: visitaActiva.fecha,
        visitado_en: new Date().toISOString(),
        latitud: visitaActiva.ubicacion?.latitud ?? null,
        longitud: visitaActiva.ubicacion?.longitud ?? null,
        precision_metros: visitaActiva.ubicacion?.precision ?? null,
        codificado_app: codificado,
        presencia_percha: carasPercha === null ? presencia : carasPercha > 0 ? "PRESENTE" : "AUSENTE",
        capturas_app: rutasCapturas,
        fotos_percha: rutasPercha,
        observaciones: observaciones || null,
        observaciones_sku: observaciones || null,
        confianza_ia: lectura.confianza || null,
        datos_ia: { ...lectura, caras_percha: carasPercha, visita_sesion_id: visitaActiva.id, visita_iniciada_en: visitaActiva.iniciadoEn },
        ...lectura,
        nombre_reportado: lectura.nombre_producto,
        codigo_barras: lectura.codigo_barras || lectura.codigo_referencia,
      })
      setVisitaActiva(registrarSkuEnVisita(visitaActiva, {
        id: productoId, nombre: catalogo.productos.find((item) => item.id === productoId)?.nombre ?? productoId,
      }))
      limpiarSku()
      setMensaje("SKU guardado. Cliente, local y ubicación se mantienen. Selecciona el siguiente producto.")
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
          {!soloCampo && ["KAM", "ADMINISTRADOR", "GERENTE"].includes(catalogo.rol) && <button className={vista === "SUPERVISION" ? "activo" : ""} onClick={() => setVista("SUPERVISION")}>Supervisión KAM</button>}
          {!soloCampo && catalogo.puede_administrar && <button className={vista === "ADMIN" ? "activo" : ""} onClick={() => setVista("ADMIN")}>Locales y reportes</button>}
        </nav>
      </header>

      {error && <div className="campo-error">{error}</div>}
      {mensaje && <div className="campo-exito">{mensaje}</div>}

      {vista === "SUPERVISION" && !soloCampo ? (
        <SupervisionCampo clientes={catalogo.clientes} />
      ) : vista === "ADMIN" && !soloCampo ? (
        <KpiKamCobertura periodo={periodo} cambiarPeriodo={cambiarPeriodo} onActualizado={onActualizado} />
      ) : vista === "DASHBOARD" ? (
        <DashboardCampo catalogo={catalogo} clienteId={clienteId} setClienteId={setClienteId} semana={semana} visitaEnCurso={!!visitaActiva} />
      ) : (
        <div className="campo-flujo">
          {!visitaActiva ? <section className="campo-paso">
            <header><b>1</b><div><span>UBICACIÓN DE LA VISITA</span><h3>¿Dónde estás trabajando?</h3></div></header>
            <div className="campo-grid campo-grid-3">
              <label><span>Cliente</span><select value={clienteId} onChange={(e) => cambiarContexto("cliente", e.target.value)} disabled={cargando || ubicando}><option value="">Seleccionar cliente</option>{catalogo.clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
              <label><span>Local</span><select value={localId} onChange={(e) => cambiarContexto("local", e.target.value)} disabled={!clienteId || cargando || ubicando}><option value="">Seleccionar local</option>{catalogo.locales.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}</select></label>
              <label><span>Fecha</span><input type="date" value={fechaVisita} onChange={(e) => setFechaVisita(e.target.value)} disabled={ubicando} /></label>
            </div>
            <button type="button" className="campo-ubicacion" onClick={obtenerUbicacion} disabled={!localId || ubicando}>{ubicando ? "Obteniendo ubicación…" : ubicacion ? `✓ Ubicación registrada · ±${Math.round(ubicacion.precision)} m` : "Registrar mi ubicación"}</button>
            <button type="button" className="campo-principal" onClick={iniciarVisita} disabled={!clienteId || !localId || cargando || ubicando}>Iniciar visita a este local</button>
            {(clienteId || localId) && <button type="button" className="campo-salir" onClick={salirSinGuardar} disabled={guardando || procesando || ubicando}>Salir sin guardar</button>}
            <small>Estos datos se usarán para todos los SKU de esta visita.</small>
          </section> : <section className="campo-paso campo-visita-activa">
            <header><b>✓</b><div><span>VISITA EN CURSO</span><h3>{catalogo.locales.find((item) => item.id === visitaActiva.localId)?.nombre ?? "Local seleccionado"}</h3></div></header>
            <p>{catalogo.clientes.find((item) => item.id === visitaActiva.clienteId)?.nombre ?? "Cliente seleccionado"} · {fechaCorta(visitaActiva.fecha)}</p>
            <small>{visitaActiva.ubicacion ? `✓ Ubicación registrada al inicio · ±${Math.round(visitaActiva.ubicacion.precision)} m` : "Visita iniciada sin ubicación"}</small>
            <p>{visitaActiva.skusGuardados.length} SKU guardados en este local</p>
            {visitaActiva.skusGuardados.length > 0 && <details><summary>Ver productos guardados</summary><ul>{visitaActiva.skusGuardados.map((item) => <li key={item.id}>✓ {item.nombre}</li>)}</ul></details>}
            <button type="button" onClick={finalizarVisita} disabled={guardando || procesando}>Finalizar visita / cambiar de local</button>
            <button type="button" className="campo-salir" onClick={salirSinGuardar} disabled={guardando || procesando || ubicando}>Salir de la visita sin guardar</button>
            <small>Se descarta solo la información pendiente. Los SKU ya guardados se conservan.</small>
          </section>}

          {visitaActiva && <section className="campo-paso">
            <header><b>2</b><div><span>PRODUCTOS DEL LOCAL</span><h3>Selecciona el SKU que vas a revisar</h3></div></header>
            <label><span>SKU</span><select value={productoId} onChange={(e) => cambiarSku(e.target.value)} disabled={guardando || procesando}>
              <option value="">Seleccionar siguiente SKU</option>{productosOrdenados.map((item) => {
                const registrado = visitaActiva.skusGuardados.some((sku) => sku.id === item.id)
                return <option key={item.id} value={item.id} disabled={registrado}>{registrado ? "✓ Guardado · " : item.autorizado ? "" : "+ "}{item.nombre} · {item.codigo}</option>
              })}
            </select></label>
            {productoId && <button type="button" className="campo-salir" onClick={() => cambiarSku("")} disabled={guardando || procesando}>Regresar sin guardar este SKU</button>}
            <small>Registra los productos que corresponden a este local y finaliza cuando termines.</small>
          </section>}

          {visitaActiva && productoId && <section className="campo-paso">
            <header><b>3</b><div><span>CAPTURAS DE FAVORITA</span><h3>Sube de 1 a 3 imágenes de {catalogo.productos.find((item) => item.id === productoId)?.nombre ?? "este SKU"}</h3></div></header>
            <label className="campo-captura">
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={seleccionarCapturas} disabled={procesando || guardando} />
              <strong>{capturas.length ? `${capturas.length} de 3 imágenes listas · agregar más` : "Tomar fotos o elegir capturas"}</strong>
              <small>Incluye la cabecera y la parte inferior si la información ocupa dos pantallas.</small>
            </label>
            {vistasCapturas.length > 0 && <><div className="campo-miniaturas">{vistasCapturas.map(({ archivo, url }) => <img key={`${archivo.name}-${archivo.lastModified}`} src={url} alt={archivo.name} />)}</div><button className="campo-limpiar" type="button" onClick={limpiarCapturas} disabled={guardando || procesando}>Quitar imágenes</button></>}
            <button className="campo-principal" type="button" disabled={procesando || guardando || capturas.length === 0} onClick={() => void analizar()}>{procesando ? progresoLectura || "Leyendo capturas…" : "Leer información automáticamente · sin costo"}</button>
            {error && <div className="campo-error campo-error-lectura">{error}</div>}
          </section>}

          {visitaActiva && productoId && lecturaConfirmada && <section className="campo-paso campo-revision">
            <header><b>4</b><div><span>CONFIRMACIÓN DEL SKU</span><h3>{catalogo.productos.find((item) => item.id === productoId)?.nombre ?? "Revisa y corrige antes de guardar"}</h3></div></header>
            {lectura.advertencias.length > 0 && <div className="campo-advertencia">{lectura.advertencias.join(" · ")}</div>}
            <div className="campo-grid campo-grid-2">
              <CampoTexto etiqueta="Código de barras" valor={lectura.codigo_barras} cambiar={(valor) => setLectura((actual) => ({ ...actual, codigo_barras: valor }))} />
              <CampoNumero etiqueta="Rotación diaria (unidades)" valor={lectura.rotacion_diaria_unidades} cambiar={(valor) => setLectura((actual) => ({ ...actual, rotacion_diaria_unidades: valor }))} />
              <CampoNumero etiqueta="Stock en local" valor={lectura.stock_local_unidades} cambiar={(valor) => setLectura((actual) => ({ ...actual, stock_local_unidades: valor }))} />
              <label><span>Caras en percha</span><input type="number" min="0" step="1" inputMode="numeric" value={carasPercha ?? ""} placeholder="Sin registrar" onChange={(e) => {
                const valor = e.target.value === "" ? null : Number(e.target.value)
                setCarasPercha(valor)
                setPresencia(valor === null ? "NO_REVISADO" : valor > 0 ? "PRESENTE" : "AUSENTE")
              }} /><small>Cuenta los frentes visibles del SKU. Cero: sin exhibición.</small></label>
              <CampoNumero etiqueta="Días de inventario local" valor={lectura.dias_inventario_local} cambiar={(valor) => setLectura((actual) => ({ ...actual, dias_inventario_local: valor }))} />
              <CampoNumero etiqueta="Venta diaria ($)" valor={lectura.venta_diaria_valor} cambiar={(valor) => setLectura((actual) => ({ ...actual, venta_diaria_valor: valor }))} />
              <CampoNumero etiqueta="Precio comercio" valor={lectura.precio_comercio} cambiar={(valor) => setLectura((actual) => ({ ...actual, precio_comercio: valor }))} />
              <CampoNumero etiqueta="Precio afiliado" valor={lectura.precio_afiliado} cambiar={(valor) => setLectura((actual) => ({ ...actual, precio_afiliado: valor }))} />
              <CampoNumero etiqueta="Stock CD (cajas)" valor={lectura.stock_cd_cajas} cambiar={(valor) => setLectura((actual) => ({ ...actual, stock_cd_cajas: valor }))} />
              <CampoNumero etiqueta="Último despacho (unidades)" valor={lectura.cantidad_ultimo_despacho} cambiar={(valor) => setLectura((actual) => ({ ...actual, cantidad_ultimo_despacho: valor }))} />
            </div>
            <div className="campo-estados">
              <fieldset><legend>¿Está codificado en la app?</legend><button type="button" className={codificado === true ? "si activo" : "si"} onClick={() => setCodificado(true)}>Sí</button><button type="button" className={codificado === false ? "no activo" : "no"} onClick={() => setCodificado(false)}>No</button></fieldset>
              <fieldset><legend>¿Está físicamente en percha?</legend>{(["PRESENTE", "AUSENTE", "NO_REVISADO"] as PresenciaPercha[]).map((item) => <button type="button" key={item} className={presencia === item ? "activo" : ""} onClick={() => { setPresencia(item); setCarasPercha(item === "AUSENTE" ? 0 : null) }}>{item === "PRESENTE" ? "Sí" : item === "AUSENTE" ? "No" : "Sin revisar"}</button>)}</fieldset>
            </div>
            {carasPercha === 0 && (lectura.stock_local_unidades ?? 0) > 0 && <div className="campo-error" role="alert">PRODUCTO CON STOCK NO PERCHADO · Hay existencia en el local y cero caras en percha.</div>}
            {carasPercha !== null && carasPercha > 0 && lectura.stock_local_unidades === 0 && <div className="campo-advertencia" role="status">Revisar dato: hay caras en percha, pero el stock reportado es cero.</div>}
            <label className="campo-foto-percha"><span>Fotos de percha (opcionales)</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={seleccionarFotosPercha} /><small>{fotosPercha.length ? `${fotosPercha.length} foto(s) lista(s)` : "Sirven como evidencia de presencia, ausencia o ubicación."}</small></label>
            <label className="campo-observaciones"><span>Observaciones</span><textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ubicación en percha, faltante, novedad, gestión realizada…" /></label>
            <button className="campo-guardar" type="button" disabled={guardando || procesando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar SKU y continuar con el siguiente"}</button>
          </section>}
        </div>
      )}
    </section>
  )
}

function DashboardCampo({ catalogo, clienteId, setClienteId, semana, visitaEnCurso }: {
  catalogo: CatalogoCampoComercial
  clienteId: string
  setClienteId: (valor: string) => void
  semana: { desde: string; hasta: string }
  visitaEnCurso: boolean
}) {
  const r = catalogo.resumen
  const cobertura = r.posiciones_revisadas > 0 ? r.codificadas / r.posiciones_revisadas * 100 : null
  return <section className="campo-dashboard">
    <div className="campo-dashboard-filtro"><div><span>SEMANA</span><strong>{fechaCorta(semana.desde)} – {fechaCorta(semana.hasta)}</strong></div><label><span>Cliente</span><select value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={visitaEnCurso}><option value="">Todos los clientes</option>{catalogo.clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>{visitaEnCurso && <small>Cliente fijado durante la visita en curso.</small>}</label></div>
    <div className="campo-cards">
      <Tarjeta titulo="Locales visitados" valor={String(r.locales_visitados)} detalle="Locales con registro esta semana" tono="vino" />
      <Tarjeta titulo="Cobertura verificada" valor={cobertura == null ? "—" : `${cobertura.toFixed(1)}%`} detalle={`${r.codificadas} de ${r.posiciones_revisadas} posiciones`} tono="verde" />
      <Tarjeta titulo="Rotación diaria" valor={r.rotacion_diaria_promedio == null ? "—" : r.rotacion_diaria_promedio.toFixed(2)} detalle="Unidades promedio por día" tono="naranja" />
      <Tarjeta titulo="Quiebres de stock" valor={String(r.quiebres_stock)} detalle="Registros con stock local en cero" tono={r.quiebres_stock > 0 ? "rojo" : "verde"} />
      <Tarjeta titulo="Presencia en percha" valor={String(r.presentes_percha)} detalle="Posiciones verificadas físicamente" tono="azul" />
      <Tarjeta titulo="Inventario local" valor={r.dias_inventario_promedio == null ? "—" : `${r.dias_inventario_promedio.toFixed(1)} días`} detalle="Promedio de días disponibles" tono="gris" />
      <Tarjeta titulo="Con stock sin perchar" valor={String(r.sin_perchar_con_stock)} detalle="Entre las últimas revisiones: stock > 0 y caras = 0" tono={r.sin_perchar_con_stock > 0 ? "rojo" : "verde"} />
    </div>
    <div className="campo-registros"><header><div><span>ÚLTIMAS REVISIONES</span><h3>Detalle semanal</h3></div><small>{catalogo.registros.length} registros</small></header>{catalogo.registros.length === 0 ? <p>No hay visitas confirmadas en esta semana.</p> : catalogo.registros.map((item) => <article key={item.id}><div><strong>{item.local_nombre}</strong><span>{item.producto_nombre}</span><small>{fechaCorta(item.fecha)}</small></div><div><b>{item.rotacion_diaria_unidades == null ? "—" : `${item.rotacion_diaria_unidades} u/día`}</b><span>Stock: {item.stock_local_unidades ?? "—"}</span><span>Caras en percha: {item.caras_percha ?? "Sin registrar"}</span>{item.caras_percha === 0 && (item.stock_local_unidades ?? 0) > 0 && <i>CON STOCK NO PERCHADO</i>}</div><i className={item.codificado_app ? "ok" : "alerta"}>{item.codificado_app ? "Codificado" : "No codificado"}</i></article>)}</div>
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

function lecturaTieneDatos(lectura: LecturaFavorita) {
  return Boolean(
    lectura.local_nombre ||
    lectura.codigo_barras ||
    lectura.codigo_referencia ||
    lectura.nombre_producto ||
    lectura.rotacion_diaria_unidades != null ||
    lectura.stock_local_unidades != null,
  )
}

const css = `
.campo-comercial{display:grid;gap:14px;color:#332824}.campo-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:20px;border:1px solid #e5d9d2;border-radius:15px;background:#fff}.campo-head>div>span,.campo-paso header span,.campo-dashboard-filtro span,.campo-registros header span{color:#f28c18;font-size:10px;font-weight:900;letter-spacing:.09em}.campo-head h2{margin:4px 0;color:#8f1d24;font-size:27px}.campo-head p{margin:0;color:#776a65}.campo-head nav{display:flex;gap:7px;flex-wrap:wrap}.campo-head button,.campo-comercial button{border:1px solid #dfd2cc;border-radius:10px;background:#fff;color:#7a302f;padding:10px 13px;font-weight:900;cursor:pointer}.campo-head button.activo,.campo-principal,.campo-guardar{border-color:#981f28!important;background:#981f28!important;color:#fff!important}.campo-error,.campo-exito,.campo-carga{padding:14px 16px;border:1px solid #ecc7ca;border-radius:12px;background:#fff4f5;color:#a21f29}.campo-exito{border-color:#c5e6d1;background:#eef9f2;color:#147542}.campo-flujo{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;max-width:940px;margin:0 auto;width:100%}.campo-paso{padding:18px;border:1px solid #e6dad4;border-radius:15px;background:#fff}.campo-paso>header{display:flex;gap:12px;align-items:center;margin-bottom:16px}.campo-paso>header>b{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#981f28;color:#fff;font-size:18px}.campo-paso h3{margin:3px 0;color:#7e1e24;font-size:21px}.campo-grid{display:grid;gap:10px}.campo-grid-3{grid-template-columns:1fr 1.4fr .75fr}.campo-grid-2{grid-template-columns:1fr 1fr}.campo-comercial label{display:grid;gap:6px}.campo-comercial label>span,.campo-estados legend{color:#6f605b;font-size:10px;font-weight:900;text-transform:uppercase}.campo-comercial input,.campo-comercial select,.campo-comercial textarea{box-sizing:border-box;width:100%;border:1px solid #daccc5;border-radius:10px;background:#fbfaf8;padding:12px;color:#352a27;font:inherit;font-weight:700}.campo-comercial textarea{min-height:90px;resize:vertical}.campo-ubicacion{margin-top:11px!important;background:#fff8ef!important;color:#9a5b0d!important;border-color:#edcf9e!important}.campo-captura{place-items:center;padding:26px 18px;border:2px dashed #d7beb5;border-radius:14px;background:#fffaf7;text-align:center;cursor:pointer}.campo-captura input{position:absolute;opacity:0;pointer-events:none}.campo-captura strong{color:#8f1d24;font-size:17px}.campo-captura small{color:#80736e}.campo-miniaturas{display:flex;gap:8px;overflow:auto;margin:12px 0}.campo-miniaturas img{width:92px;height:128px;object-fit:cover;border:1px solid #ded0c9;border-radius:10px}.campo-principal,.campo-guardar{width:100%;margin-top:12px;font-size:15px}.campo-comercial button:disabled{opacity:.55;cursor:wait}.campo-advertencia{margin-bottom:12px;padding:10px;border-radius:9px;background:#fff2dc;color:#925b13}.campo-estados{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:13px}.campo-estados fieldset{display:flex;gap:7px;flex-wrap:wrap;margin:0;padding:12px;border:1px solid #e3d7d0;border-radius:11px}.campo-estados legend{padding:0 5px}.campo-estados button.activo,.campo-estados button.si.activo{background:#18864b;color:#fff;border-color:#18864b}.campo-estados button.no.activo{background:#aa2630;color:#fff;border-color:#aa2630}.campo-foto-percha,.campo-observaciones{margin-top:13px}.campo-foto-percha small{color:#80736e}.campo-dashboard{display:grid;gap:14px}.campo-dashboard-filtro{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:15px 18px;border:1px solid #e6dad4;border-radius:13px;background:#fff}.campo-dashboard-filtro>div{display:grid;gap:4px}.campo-dashboard-filtro label{min-width:290px}.campo-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.campo-card{display:grid;gap:8px;min-height:120px;padding:17px;border:1px solid #e5dad4;border-top:5px solid #8f1d24;border-radius:13px;background:#fff}.campo-card span{font-size:11px;font-weight:900;text-transform:uppercase;color:#6d5e59}.campo-card strong{font-size:29px;color:#8f1d24}.campo-card small{color:#827570}.campo-card.verde{border-top-color:#18864b}.campo-card.verde strong{color:#18864b}.campo-card.naranja{border-top-color:#ed8c18}.campo-card.rojo{border-top-color:#aa2630}.campo-card.azul{border-top-color:#3679a6}.campo-card.gris{border-top-color:#8e827c}.campo-registros{border:1px solid #e5dad4;border-radius:14px;background:#fff;overflow:hidden}.campo-registros>header{display:flex;justify-content:space-between;align-items:end;padding:16px}.campo-registros h3{margin:3px 0;color:#8f1d24}.campo-registros>p{padding:20px;text-align:center;color:#817570}.campo-registros article{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;padding:13px 16px;border-top:1px solid #eee5e0}.campo-registros article div{display:grid;gap:3px}.campo-registros article span,.campo-registros article small{color:#817570;font-size:11px}.campo-registros article i{padding:6px 9px;border-radius:99px;background:#fdebed;color:#a5242d;font-size:10px;font-style:normal;font-weight:900}.campo-registros article i.ok{background:#e7f6ed;color:#147542}
.campo-salir{display:block;margin:12px 0}
@media(max-width:800px){.campo-head{align-items:stretch;display:grid;padding:16px}.campo-head nav{display:grid;grid-template-columns:1fr 1fr}.campo-head nav button:last-child:nth-child(3){grid-column:1/-1}.campo-grid-3,.campo-grid-2,.campo-estados,.campo-cards{grid-template-columns:1fr}.campo-paso{padding:15px}.campo-dashboard-filtro{align-items:stretch;display:grid}.campo-dashboard-filtro label{min-width:0}.campo-registros article{grid-template-columns:1fr auto}.campo-registros article i{grid-column:1/-1;justify-self:start}.campo-flujo{max-width:none}.campo-head h2{font-size:24px}.campo-paso h3{font-size:18px}}
`
