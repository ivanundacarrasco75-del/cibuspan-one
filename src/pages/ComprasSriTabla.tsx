import { useEffect, useRef, useState } from "react"
import SugerenciaRetencionIva from "../components/SugerenciaRetencionIva"
import { listarPerfilesRetencionIva } from "../repositories/retencionesRepository"
import type { PerfilRetencionIva } from "../utils/sugerenciasRetencionIva"
import {
  editarCompraSri,
  type CampoCompra, type CompraGuardada, type ControlCompra,
} from "../repositories/comprasSriRepository"
import ComprasSriFiltroProveedor from "./ComprasSriFiltroProveedor"
import ComprasRecepcionMp from "./ComprasRecepcionMp"
import "./comprasSriTabla.css"

const columnas: { campo: CampoCompra; titulo: string; tipo?: "date" | "importe" }[] = [
  { campo: "fecha", titulo: "Fecha emisión", tipo: "date" },
  { campo: "serie", titulo: "Factura" },
  { campo: "proveedor", titulo: "Proveedor" },
  { campo: "descripcion", titulo: "Descripción" },
  { campo: "subtotal", titulo: "Subtotal", tipo: "importe" },
  { campo: "iva", titulo: "IVA", tipo: "importe" },
  { campo: "retencion", titulo: "Retención" },
  { campo: "total", titulo: "Total", tipo: "importe" },
  { campo: "documento", titulo: "N.º documento" },
]

const formato = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneda = (centavos: number) => formato.format(centavos / 100)
const centavos = (valor: string) => Math.round(Number(valor) * 100)
const totalColumnas = columnas.length + 3

function FilaCompra({ compra, alCambiarProveedor, perfiles }: { compra: CompraGuardada; alCambiarProveedor: () => void; perfiles: PerfilRetencionIva[] | null }) {
  const { datos, ride_leido } = compra
  const [control, setControl] = useState<ControlCompra>({ edicion: compra.edicion, abonos: compra.abonos })
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const ocupado = useRef(false)
  const iva = datos.impuestos.filter((impuesto) => impuesto.codigo === "2")
    .reduce((acumulado, impuesto) => acumulado + centavos(impuesto.valor), 0)
  const campos = {
    fecha: datos.fecha,
    serie: datos.serie,
    proveedor: datos.proveedor,
    descripcion: datos.items.map((item) => item.descripcion).join(" · ").slice(0, 500),
    subtotal: datos.subtotal,
    iva: datos.clave.startsWith("excel:") && datos.impuestos.length === 0 ? "" : (iva / 100).toFixed(2),
    retencion: "",
    total: datos.total,
    documento: compra.documento_excel ?? "",
    ...control.edicion,
  }
  const pagado = control.abonos.reduce((suma, abono) => suma + centavos(abono.valor), 0)
  const neto = compra.origen_excel || compra.neto_excel != null ? compra.neto_excel : Number(campos.total)
  const saldo = neto === null || neto === undefined ? null : Math.max(0, Math.round(neto * 100) - pagado)
  const liquidada = saldo === 0 && pagado > 0

  async function guardar(campo: CampoCompra, valor: string) {
    if (ocupado.current) return false
    ocupado.current = true
    setGuardando(true)
    setError("")
    try {
      const resultado = await editarCompraSri(datos.clave, campo, valor)
      setControl(compra.origen_excel ? { ...resultado, abonos: compra.abonos } : resultado)
      return true
    } catch (fallo) {
      setError(typeof fallo === "object" && fallo && "message" in fallo
        ? String(fallo.message) : "No se pudo guardar la factura.")
      return false
    } finally {
      ocupado.current = false
      setGuardando(false)
    }
  }

  return (
    <>
      <tr className={liquidada ? "compras-sri-pagada" : undefined}>
        {columnas.map(({ campo, titulo, tipo }) => {
          const valor = campos[campo]
          return (
            <td key={campo} className={`compras-sri-celda-${campo}`}>
              <input key={valor} aria-label={`${titulo} de ${campos.serie}`} defaultValue={valor} title={valor}
                type={tipo === "date" ? "date" : "text"} inputMode={tipo === "importe" ? "decimal" : undefined}
                maxLength={500} readOnly={guardando || datos.clave.startsWith("excel:") || (campo === "retencion" && Boolean(control.edicion.retencion_estado))} onBlur={(evento) => {
                  if (datos.clave.startsWith("excel:")) return
                  const input = evento.currentTarget
                  const nuevo = input.value.trim()
                  const normalizado = tipo === "importe" ? nuevo.replace(",", ".") : nuevo
                  if (normalizado === valor) return
                  void guardar(campo, normalizado).then((ok) => {
                    if (ok) {
                      input.value = normalizado
                      if (campo === "proveedor") alCambiarProveedor()
                    }
                  })
                }}
                onKeyDown={(evento) => {
                  if (evento.key === "Escape") evento.currentTarget.value = valor
                  if (evento.key === "Escape" || evento.key === "Enter") evento.currentTarget.blur()
                }} />
              {campo === "retencion" && control.edicion.retencion_estado === "CALCULADA" && <small title="Editable en Pagos y Finanzas → Reglas de retenciones">Calculada · pendiente de emisión</small>}
              {campo === "retencion" && control.edicion.retencion_revision && <small title={control.edicion.retencion_revision}>Revisar retención</small>}
            </td>
          )
        })}
        <td className="compras-sri-estado">{saldo === null ? "Por revisar" : liquidada ? "Pagada" : saldo === 0 ? "Sin saldo" : pagado ? "Abonada" : "Pendiente"}</td>
        <td>{perfiles === null ? "Consultando historial…" : <SugerenciaRetencionIva
          perfil={perfiles.find(p => p.ruc === datos.ruc)} ruc={datos.ruc} fecha={campos.fecha}
          iva={campos.iva === "" ? null : Number(campos.iva)}
          descuentoIncluido={Number(campos.retencion) > 0 || (neto != null && Number(campos.total) > neto)} />}</td>
        <td>
          <button type="button" aria-expanded={detalleAbierto} onClick={() => setDetalleAbierto(abierto => !abierto)}>Detalle</button>
        </td>
      </tr>
      {detalleAbierto && (
        <tr>
          <td colSpan={totalColumnas} className="compras-sri-detalle">
            {compra.origen_excel && <div>
              <div>{compra.observaciones_excel}</div>
              <div>Neto del Excel: {neto === null || neto === undefined ? "Pendiente de completar" : moneda(Math.round(neto * 100))}</div>
            </div>}
            <div>RUC {datos.ruc || "pendiente"} · RIDE {ride_leido ? "vinculado" : "pendiente"}</div>
            <div>{datos.estadoXml}</div>
            <div>Autorización {datos.autorizacion}</div>
            {datos.clave.startsWith("excel:") ? <div>{campos.descripcion}</div> : <ul>{datos.items.map((item, indice) => (
              <li key={indice}>{item.codigo} · {item.descripcion} · {item.cantidad} × {item.precio}
                {" · Subtotal "}{moneda(centavos(item.subtotal))}</li>
            ))}</ul>}
            {datos.pagos.map((pago, indice) => (
              <div key={indice}>Forma de pago XML {pago.forma} · {pago.total} · {pago.plazo} {pago.unidad}</div>
            ))}
            <ComprasRecepcionMp factura={datos} fechaFactura={campos.fecha} />
          </td>
        </tr>
      )}
      {control.abonos.map((abono) => (
        <tr className="compras-sri-pagada compras-sri-movimiento" key={abono.id}>
          <td>{abono.fecha || "Fecha pendiente"}</td><td colSpan={6}>Pago de {campos.serie}</td>
          <td className="compras-sri-monto">{moneda(centavos(abono.valor))}</td>
          <td>{abono.documento}</td><td colSpan={3}>Pagado</td>
        </tr>
      ))}
      {control.abonos.length > 0 && saldo !== null && saldo > 0 && (
        <tr className="compras-sri-saldo">
          <td colSpan={7}>Saldo pendiente de {campos.serie}</td>
          <td className="compras-sri-monto">{moneda(saldo)}</td><td colSpan={4} />
        </tr>
      )}
      {error && <tr><td colSpan={totalColumnas} role="alert" className="compras-sri-error">{error}</td></tr>}
    </>
  )
}

export default function ComprasSriTabla({ compras, proveedor, elegirProveedor, alCambiarProveedor }: {
  compras: CompraGuardada[]
  proveedor: string | null
  elegirProveedor: (nombre: string | null) => void
  alCambiarProveedor: () => void
}) {
  const [perfiles, setPerfiles] = useState<PerfilRetencionIva[] | null>(null)
  const [errorHistorial, setErrorHistorial] = useState(false)
  useEffect(() => {
    let vigente = true
    void listarPerfilesRetencionIva().then(filas => { if (vigente) setPerfiles(filas) })
      .catch(() => { if (vigente) { setPerfiles([]); setErrorHistorial(true) } })
    return () => { vigente = false }
  }, [])
  return (
    <>
    {errorHistorial && <p role="alert">No se pudo consultar el historial de IVA. Revisa las retenciones antes de registrar el pago.</p>}
    <div className="compras-sri-contenedor" tabIndex={0} role="region" aria-label="Tabla desplazable de facturas">
      <table className="compras-sri-tabla compras-sri-tabla-con-sugerencias" aria-label="Facturas de compra">
        <colgroup>
          {columnas.map(({ campo }) => <col key={campo} className={`compras-sri-col-${campo}`} />)}
          <col className="compras-sri-col-estado" />
          <col className="compras-sri-col-sugerencia" />
          <col className="compras-sri-col-detalle" />
        </colgroup>
        <thead><tr>
          {columnas.map(({ campo, titulo }) => <th key={campo} scope="col">
            {campo === "proveedor" ? <ComprasSriFiltroProveedor proveedor={proveedor} elegir={elegirProveedor} /> : titulo}
          </th>)}
          <th scope="col">Estado</th>
          <th scope="col">IVA sugerido por historial</th>
          <th scope="col">Detalle</th>
        </tr></thead>
        <tbody>{compras.map((compra) => <FilaCompra key={compra.datos.clave} compra={compra} alCambiarProveedor={alCambiarProveedor} perfiles={perfiles} />)}</tbody>
      </table>
    </div>
    </>
  )
}
