import { useCallback, useEffect, useMemo, useState } from "react"
import {
  guardarAsignacionKpiKamDb,
  guardarPresupuestoKpiKamDb,
  habilitarUsuarioKpiKamDb,
  obtenerCatalogoConfiguracionKpiKamDb,
  obtenerPropuestaPresupuestoKpiKamDb,
  type CatalogoConfiguracionKpiKamDb,
  type PropuestaPresupuestoKpiKamDb,
} from "../../repositories/kpiKamRepository"

type Props = {
  periodo: string
  cambiarPeriodo: (periodo: string) => void
  onActualizado: () => void
}

const VACIO: CatalogoConfiguracionKpiKamDb = {
  puede_configurar: false,
  usuarios: [],
  clientes: [],
}

export default function KpiKamConfiguracion({
  periodo,
  cambiarPeriodo,
  onActualizado,
}: Props) {
  const [catalogo, setCatalogo] = useState(VACIO)
  const [asignaciones, setAsignaciones] = useState<Record<string, string>>({})
  const [presupuestos, setPresupuestos] = useState<Record<string, string>>({})
  const [propuestas, setPropuestas] = useState<Record<string, PropuestaPresupuestoKpiKamDb>>({})
  const [crecimiento, setCrecimiento] = useState("0")
  const [usuarioNuevo, setUsuarioNuevo] = useState("")
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [error, setError] = useState("")

  const cargar = useCallback(async () => {
    setCargando(true)
    setError("")
    try {
      const datos = await obtenerCatalogoConfiguracionKpiKamDb(periodo)
      setCatalogo(datos)
      setAsignaciones(Object.fromEntries(
        datos.clientes.map((cliente) => [
          cliente.cliente_id,
          cliente.kam_user_id ?? "",
        ]),
      ))
      setPresupuestos(Object.fromEntries(
        datos.clientes.map((cliente) => [
          cliente.cliente_id,
          cliente.presupuesto == null ? "" : String(cliente.presupuesto),
        ]),
      ))
      setPropuestas({})
    } catch (err) {
      setCatalogo(VACIO)
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la configuración.",
      )
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const usuariosKam = useMemo(
    () => catalogo.usuarios.filter((usuario) => usuario.rol === "KAM"),
    [catalogo.usuarios],
  )
  const candidatos = useMemo(
    () => catalogo.usuarios.filter(
      (usuario) => !["KAM", "ADMINISTRADOR", "GERENTE"].includes(usuario.rol),
    ),
    [catalogo.usuarios],
  )

  async function habilitarKam() {
    if (!usuarioNuevo) return
    const usuario = catalogo.usuarios.find(
      (item) => item.user_id === usuarioNuevo,
    )
    if (!usuario) return
    const nombre = usuario.nombre || usuario.email
    const confirmar = window.confirm(
      `El rol actual de ${nombre} es ${usuario.rol}. ¿Deseas cambiarlo a KAM?`,
    )
    if (!confirmar) return

    setGuardando("USUARIO")
    setMensaje("")
    setError("")
    try {
      await habilitarUsuarioKpiKamDb(usuario.user_id)
      setUsuarioNuevo("")
      setMensaje(`${nombre} fue habilitado como KAM.`)
      await cargar()
      onActualizado()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo habilitar el KAM.",
      )
    } finally {
      setGuardando("")
    }
  }

  async function calcularPropuesta() {
    const porcentaje = Number(crecimiento.replace(",", "."))
    if (!Number.isFinite(porcentaje) || porcentaje < -100) {
      setError("El crecimiento esperado debe ser un porcentaje válido mayor o igual a -100%.")
      return
    }

    const tienePresupuestos = Object.values(presupuestos).some(
      (valor) => valor.trim() !== "",
    )
    if (tienePresupuestos && !window.confirm(
      "La propuesta reemplazará los valores visibles en el formulario. Nada se guardará hasta que presiones Guardar.",
    )) return

    setGuardando("PROPUESTA")
    setMensaje("")
    setError("")
    try {
      const datos = await obtenerPropuestaPresupuestoKpiKamDb(periodo)
      const porCliente = Object.fromEntries(
        datos.map((propuesta) => [propuesta.cliente_id, propuesta]),
      )
      setPropuestas(porCliente)
      setPresupuestos((actuales) => ({
        ...actuales,
        ...Object.fromEntries(datos.map((propuesta) => [
          propuesta.cliente_id,
          Math.max(
            0,
            propuesta.venta_neta_promedio * (1 + porcentaje / 100),
          ).toFixed(2),
        ])),
      }))
      setMensaje("Propuesta calculada. Revisa cada valor y guarda únicamente cuando estés de acuerdo.")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo calcular la propuesta.",
      )
    } finally {
      setGuardando("")
    }
  }

  async function guardarCliente(clienteId: string) {
    const kamUserId = asignaciones[clienteId] || null
    const presupuestoTexto = presupuestos[clienteId]?.trim() ?? ""
    const presupuesto = presupuestoTexto === ""
      ? null
      : Number(presupuestoTexto.replace(",", "."))

    if (presupuesto != null && (!Number.isFinite(presupuesto) || presupuesto < 0)) {
      setError("El presupuesto debe ser un valor mayor o igual a cero.")
      return
    }
    if (presupuesto != null && !kamUserId) {
      setError("Selecciona primero un KAM antes de guardar el presupuesto.")
      return
    }

    setGuardando(clienteId)
    setMensaje("")
    setError("")
    try {
      await guardarAsignacionKpiKamDb({
        periodo,
        clienteId,
        kamUserId,
      })
      if (presupuesto != null) {
        await guardarPresupuestoKpiKamDb({
          periodo,
          clienteId,
          presupuesto,
        })
      }
      setMensaje("Responsable y presupuesto guardados correctamente.")
      setCatalogo((actual) => ({
        ...actual,
        clientes: actual.clientes.map((cliente) =>
          cliente.cliente_id === clienteId
            ? {
                ...cliente,
                kam_user_id: kamUserId,
                kam_nombre: catalogo.usuarios.find(
                  (usuario) => usuario.user_id === kamUserId,
                )?.nombre ?? null,
                presupuesto,
              }
            : cliente,
        ),
      }))
      onActualizado()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la configuración.",
      )
    } finally {
      setGuardando("")
    }
  }

  if (cargando) {
    return <div className="kam-config-carga">Cargando configuración KPI KAM…</div>
  }

  if (error && !catalogo.puede_configurar) {
    return <div className="kam-config-error">{error}</div>
  }

  if (!catalogo.puede_configurar) {
    return (
      <div className="kam-config-bloqueada">
        Esta sección está disponible únicamente para Administrador y Gerente.
      </div>
    )
  }

  return (
    <section className="kam-config">
      <style>{css}</style>

      <header className="kam-config-head">
        <div>
          <span>CONFIGURACIÓN INICIAL</span>
          <h2>Responsables y presupuesto mensual</h2>
          <p>Los cambios se aplican desde el mes seleccionado y conservan el historial anterior.</p>
        </div>
        <label>
          <span>Periodo</span>
          <input
            type="month"
            value={periodo}
            onChange={(event) => cambiarPeriodo(event.target.value)}
          />
        </label>
      </header>

      <section className="kam-config-usuario">
        <div>
          <span>PASO 1</span>
          <h3>Habilitar responsable KAM</h3>
          <p>Esta acción cambia el rol del usuario seleccionado a KAM. No afecta al Administrador ni al Gerente.</p>
        </div>
        <div className="kam-config-usuario-form">
          <select value={usuarioNuevo} onChange={(event) => setUsuarioNuevo(event.target.value)}>
            <option value="">Seleccionar usuario activo</option>
            {candidatos.map((usuario) => (
              <option key={usuario.user_id} value={usuario.user_id}>
                {usuario.nombre || usuario.email} · {usuario.rol}
              </option>
            ))}
          </select>
          <button type="button" disabled={!usuarioNuevo || guardando === "USUARIO"} onClick={() => void habilitarKam()}>
            {guardando === "USUARIO" ? "Habilitando…" : "Habilitar como KAM"}
          </button>
        </div>
        <small>KAM habilitados: {usuariosKam.length}</small>
      </section>

      {error && <div className="kam-config-error">{error}</div>}
      {mensaje && <div className="kam-config-exito">{mensaje}</div>}

      <section className="kam-config-clientes">
        <header>
          <div><span>PASO 2</span><h3>Asignar clientes y presupuesto</h3></div>
          <small>{catalogo.clientes.length} clientes activos</small>
        </header>
        {usuariosKam.length === 0 ? (
          <div className="kam-config-aviso">Primero habilita al menos un usuario como KAM.</div>
        ) : (
          <>
          <div className="kam-config-propuesta">
            <div>
              <strong>Propuesta automática</strong>
              <small>Promedio de ventas netas de los últimos 3 meses cerrados. No se guarda automáticamente.</small>
            </div>
            <label>
              <span>Crecimiento esperado</span>
              <div><input type="number" min="-100" step="0.1" value={crecimiento} onChange={(event) => setCrecimiento(event.target.value)} /><b>%</b></div>
            </label>
            <button type="button" disabled={Boolean(guardando)} onClick={() => void calcularPropuesta()}>
              {guardando === "PROPUESTA" ? "Calculando…" : "Calcular propuesta"}
            </button>
          </div>
          <div className="kam-config-tabla">
            <table>
              <thead><tr><th>Cliente</th><th>Responsable</th><th>Base neta 3 meses</th><th>Presupuesto mensual</th><th /></tr></thead>
              <tbody>
                {catalogo.clientes.map((cliente) => (
                  <tr key={cliente.cliente_id}>
                    <td data-label="Cliente"><strong>{cliente.cliente_nombre}</strong></td>
                    <td data-label="Responsable">
                      <select
                        value={asignaciones[cliente.cliente_id] ?? ""}
                        onChange={(event) => setAsignaciones((actual) => ({
                          ...actual,
                          [cliente.cliente_id]: event.target.value,
                        }))}
                      >
                        <option value="">Sin responsable</option>
                        {usuariosKam.map((usuario) => (
                          <option key={usuario.user_id} value={usuario.user_id}>
                            {usuario.nombre || usuario.email}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Base neta 3 meses" className="kam-config-base">
                      {propuestas[cliente.cliente_id] ? (
                        <><strong>{moneda(propuestas[cliente.cliente_id].venta_neta_promedio)}</strong><small>{propuestas[cliente.cliente_id].meses_con_ventas}/3 meses con ventas</small></>
                      ) : "—"}
                    </td>
                    <td data-label="Presupuesto mensual">
                      <div className="kam-config-dinero"><span>$</span><input type="number" min="0" step="0.01" value={presupuestos[cliente.cliente_id] ?? ""} placeholder="0,00" onChange={(event) => setPresupuestos((actual) => ({ ...actual, [cliente.cliente_id]: event.target.value }))} /></div>
                    </td>
                    <td data-label="Acción"><button type="button" disabled={Boolean(guardando)} onClick={() => void guardarCliente(cliente.cliente_id)}>{guardando === cliente.cliente_id ? "Guardando…" : "Guardar"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.values(propuestas)[0] && (
            <div className="kam-config-periodo-base">
              Base utilizada: {fechaCorta(Object.values(propuestas)[0].periodo_desde)} al {fechaCorta(Object.values(propuestas)[0].periodo_hasta)}. El valor sigue editable antes de guardar.
            </div>
          )}
          </>
        )}
      </section>
    </section>
  )
}

function moneda(valor: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(valor)
}

function fechaCorta(valor: string) {
  if (!valor) return "—"
  const [anio, mes, dia] = valor.slice(0, 10).split("-")
  return `${dia}/${mes}/${anio}`
}

const css = `
.kam-config{display:grid;gap:14px}.kam-config-carga,.kam-config-bloqueada,.kam-config-error,.kam-config-exito{padding:18px;border-radius:12px;border:1px solid #e7dad4;background:white}.kam-config-error{color:#a1212a;background:#fff5f5;border-color:#edc8ca}.kam-config-exito{color:#147542;background:#eef9f2;border-color:#c6e7d2}.kam-config-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:20px;border:1px solid #e6dad4;border-radius:14px;background:white}.kam-config-head>div>span,.kam-config-usuario>div>span,.kam-config-clientes>header span{display:block;color:#f28c18;font-size:11px;font-weight:900;letter-spacing:.09em}.kam-config-head h2,.kam-config-usuario h3,.kam-config-clientes h3{margin:4px 0;color:#8f1d24}.kam-config-head p,.kam-config-usuario p{margin:0;color:#786b66}.kam-config-head label{display:grid;gap:5px;min-width:190px}.kam-config-head label>span{font-size:11px;font-weight:900;color:#746660;text-transform:uppercase}.kam-config-head input,.kam-config select,.kam-config input{border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;padding:10px;color:#3b2d29;font-weight:700}.kam-config-usuario{display:grid;grid-template-columns:1fr 1.2fr auto;gap:20px;align-items:center;padding:18px;border:1px solid #e6dad4;border-radius:14px;background:white}.kam-config-usuario-form{display:grid;grid-template-columns:1fr auto;gap:8px}.kam-config button{border:0;border-radius:9px;background:#991f28;color:white;padding:10px 14px;font-weight:800;cursor:pointer}.kam-config button:disabled{opacity:.5;cursor:not-allowed}.kam-config-usuario>small{color:#766862;white-space:nowrap}.kam-config-clientes{border:1px solid #e6dad4;border-radius:14px;background:white;overflow:hidden}.kam-config-clientes>header{display:flex;justify-content:space-between;align-items:flex-end;padding:18px}.kam-config-clientes>header small{color:#81746f}.kam-config-aviso{margin:0 18px 18px;padding:16px;border-radius:10px;background:#fff6e7;color:#865b12}.kam-config-propuesta{display:grid;grid-template-columns:1fr 190px auto;gap:16px;align-items:end;margin:0 18px 18px;padding:15px;border-radius:11px;background:#fff8ed;border:1px solid #f1d6ad}.kam-config-propuesta>div:first-child{display:grid;gap:4px}.kam-config-propuesta strong{color:#7f2425}.kam-config-propuesta small{color:#766862}.kam-config-propuesta label{display:grid;gap:5px}.kam-config-propuesta label>span{font-size:10px;font-weight:900;text-transform:uppercase;color:#746660}.kam-config-propuesta label>div{display:flex;align-items:center}.kam-config-propuesta label input{width:100%;border-radius:9px 0 0 9px}.kam-config-propuesta label b{align-self:stretch;display:grid;place-items:center;padding:0 10px;border:1px solid #ddcfc8;border-left:0;border-radius:0 9px 9px 0;background:#fbf9f7}.kam-config-tabla{overflow:auto}.kam-config table{width:100%;border-collapse:collapse;min-width:940px}.kam-config th{padding:11px 14px;text-align:left;background:#f7f3f0;color:#6f605b;font-size:11px;text-transform:uppercase}.kam-config td{padding:11px 14px;border-top:1px solid #eee4de}.kam-config td select{width:100%;min-width:210px}.kam-config-base strong,.kam-config-base small{display:block}.kam-config-base small{margin-top:3px;color:#897b75}.kam-config-dinero{display:flex;align-items:center;border:1px solid #ddcfc8;border-radius:9px;background:#fbf9f7;overflow:hidden;min-width:170px}.kam-config-dinero span{padding-left:10px;color:#746660;font-weight:900}.kam-config-dinero input{width:100%;border:0;background:transparent}.kam-config td:last-child{text-align:right}.kam-config-periodo-base{padding:11px 18px;color:#766862;background:#fbf9f7;border-top:1px solid #eee4de;font-size:12px}@media(max-width:800px){.kam-config-head,.kam-config-usuario,.kam-config-propuesta{grid-template-columns:1fr;display:grid}.kam-config-head label{min-width:0}.kam-config-usuario-form{grid-template-columns:1fr}.kam-config-usuario>small{white-space:normal}}
`
