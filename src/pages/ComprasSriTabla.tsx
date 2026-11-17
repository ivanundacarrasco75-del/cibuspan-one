import { useRef, useState } from "react"
import {
  abonarCompraSri, editarCompraSri,
  type CampoCompra, type CompraGuardada, type ControlCompra,
} from "../repositories/comprasSriRepository"
import ComprasSriFiltroProveedor from "./ComprasSriFiltroProveedor"
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
const hoy = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guayaquil" }).format()
const totalColumnas = columnas.length + 2

function FilaCompra({ compra, alCambiarProveedor }: { compra: CompraGuardada; alCambiarProveedor: () => void }) {
  const { datos, ride_leido } = compra
  const [control, setControl] = useState<ControlCompra>({ edicion: compra.edicion, abonos: compra.abonos })
  const [error, setError] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const [modo, setModo] = useState<"abono" | "pago" | null>(null)
  const ocupado = useRef(false)
  const idAbono = useRef("")
  const iva = datos.impuestos.filter((impuesto) => impuesto.codigo === "2")
    .reduce((acumulado, impuesto) => acumulado + centavos(impuesto.valor), 0)
  const campos = {
    fecha: datos.fecha,
    serie: datos.serie,
    proveedor: datos.proveedor,
    descripcion: datos.items.map((item) => item.descripcion).join(" · ").slice(0, 500),
    subtotal: datos.subtotal,
    iva: (iva / 100).toFixed(2),
    retencion: "",
    total: datos.total,
    documento: "",
    ...control.edicion,
  }
  const pagado = control.abonos.reduce((suma, abono) => suma + centavos(abono.valor), 0)
  const saldo = Math.max(0, centavos(campos.total) - pagado)
  const liquidada = saldo === 0 && pagado > 0

  async function guardar(operacion: () => Promise<ControlCompra>) {
    if (ocupado.current) return false
    ocupado.current = true
    setGuardando(true)
    setError("")
    try {
      setControl(await operacion())
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

  function abrirPago(tipo: "abono" | "pago") {
    idAbono.current = crypto.randomUUID()
    setModo(tipo)
    setError("")
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
                maxLength={500} readOnly={guardando} onBlur={(evento) => {
                  const input = evento.currentTarget
                  const nuevo = input.value.trim()
                  const normalizado = tipo === "importe" ? nuevo.replace(",", ".") : nuevo
                  if (normalizado === valor) return
                  void guardar(() => editarCompraSri(datos.clave, campo, normalizado)).then((ok) => {
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
            </td>
          )
        })}
        <td className="compras-sri-estado">{liquidada ? "Pagada" : saldo === 0 ? "Sin saldo" : pagado ? "Abonada" : "Pendiente"}</td>
        <td className="compras-sri-acciones">
          <div>
            {saldo > 0 && (
              <>
                <button type="button" disabled={guardando || modo !== null} onClick={() => abrirPago("abono")}>Abonar</button>
                <button type="button" title="Registrar pago del saldo" disabled={guardando || modo !== null} onClick={() => abrirPago("pago")}>Pagar</button>
              </>
            )}
            <button type="button" aria-expanded={detalleAbierto} onClick={() => setDetalleAbierto(abierto => !abierto)}>Detalle</button>
          </div>
        </td>
      </tr>
      {detalleAbierto && (
        <tr>
          <td colSpan={totalColumnas} className="compras-sri-detalle">
            <div>RUC {datos.ruc} · RIDE {ride_leido ? "vinculado" : "pendiente"}</div>
            <div>{datos.estadoXml}</div>
            <div>Autorización {datos.autorizacion}</div>
            <ul>{datos.items.map((item, indice) => (
              <li key={indice}>{item.codigo} · {item.descripcion} · {item.cantidad} × {item.precio}
                {" · Subtotal "}{moneda(centavos(item.subtotal))}</li>
            ))}</ul>
            {datos.pagos.map((pago, indice) => (
              <div key={indice}>Forma de pago XML {pago.forma} · {pago.total} · {pago.plazo} {pago.unidad}</div>
            ))}
          </td>
        </tr>
      )}
      {control.abonos.map((abono) => (
        <tr className="compras-sri-pagada compras-sri-movimiento" key={abono.id}>
          <td>{abono.fecha}</td><td colSpan={6}>Pago de {campos.serie}</td>
          <td className="compras-sri-monto">{moneda(centavos(abono.valor))}</td>
          <td>{abono.documento}</td><td colSpan={2}>Pagado</td>
        </tr>
      ))}
      {control.abonos.length > 0 && saldo > 0 && (
        <tr className="compras-sri-saldo">
          <td colSpan={7}>Saldo pendiente de {campos.serie}</td>
          <td className="compras-sri-monto">{moneda(saldo)}</td><td colSpan={3} />
        </tr>
      )}
      {modo && (
        <tr>
          <td colSpan={totalColumnas}>
            <form className="compras-sri-formulario" onSubmit={(evento) => {
              evento.preventDefault()
              const formulario = new FormData(evento.currentTarget)
              const valor = modo === "abono" ? String(formulario.get("valor")) : null
              const fecha = String(formulario.get("fecha"))
              const documento = String(formulario.get("documento"))
              void guardar(() => abonarCompraSri(datos.clave, idAbono.current, valor, fecha, documento))
                .then((ok) => { if (ok) setModo(null) })
            }}>
              {modo === "abono"
                ? <label>Abono <input name="valor" type="number" min="0.01" max={(saldo / 100).toFixed(2)} step="0.01" required /></label>
                : <strong>Pago del saldo de {moneda(saldo)}</strong>}
              <label>Fecha de pago <input name="fecha" type="date" defaultValue={hoy()} required /></label>
              <label>N.º documento <input name="documento" maxLength={500} /></label>
              <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar pago"}</button>
              <button type="button" disabled={guardando} onClick={() => { setModo(null); setError("") }}>Cancelar</button>
            </form>
          </td>
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
  return (
    <div className="compras-sri-contenedor" tabIndex={0} role="region" aria-label="Tabla desplazable de facturas">
      <table className="compras-sri-tabla" aria-label="Facturas de compra">
        <colgroup>
          {columnas.map(({ campo }) => <col key={campo} className={`compras-sri-col-${campo}`} />)}
          <col className="compras-sri-col-estado" />
          <col className="compras-sri-col-acciones" />
        </colgroup>
        <thead><tr>
          {columnas.map(({ campo, titulo }) => <th key={campo} scope="col">
            {campo === "proveedor" ? <ComprasSriFiltroProveedor proveedor={proveedor} elegir={elegirProveedor} /> : titulo}
          </th>)}
          <th scope="col">Estado</th>
          <th scope="col">Pagos</th>
        </tr></thead>
        <tbody>{compras.map((compra) => <FilaCompra key={compra.datos.clave} compra={compra} alCambiarProveedor={alCambiarProveedor} />)}</tbody>
      </table>
    </div>
  )
}
