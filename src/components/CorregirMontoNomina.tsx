import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import type { CuentaCompra } from "../repositories/finanzasComprasRepository"
import { corregirMontoNomina, type CorreccionMontoNomina } from "../repositories/nominaRepository"

export default function CorregirMontoNomina({cuenta,cerrar,alGuardar}:{cuenta:CuentaCompra;cerrar:()=>void;alGuardar:()=>void}) {
 const dialogo=useRef<HTMLDialogElement>(null),titulo=useId(),bloqueo=useRef(false)
 const [total,setTotal]=useState(Number(cuenta.total).toFixed(2)),[motivo,setMotivo]=useState("Corrección del monto total de nómina"),[error,setError]=useState("")
 const [ocupado,setOcupado]=useState(false),[pendiente,setPendiente]=useState<CorreccionMontoNomina|null>(null),bloqueado=ocupado||pendiente!==null
 useEffect(()=>{const d=dialogo.current,a=document.activeElement;d?.showModal();return()=>{d?.close();if(a instanceof HTMLElement&&a.isConnected)a.focus()}},[])
 async function guardar(e:FormEvent){e.preventDefault();if(bloqueo.current)return;const d=pendiente??{operacion:crypto.randomUUID(),documento:cuenta.id,anterior:Number(cuenta.total),total,motivo:motivo.trim()};bloqueo.current=true;setOcupado(true);setPendiente(d);setError("");try{await corregirMontoNomina(d);alGuardar()}catch(e){if(e&&typeof e==="object"&&"rechazado" in e&&e.rechazado)setPendiente(null);setError(e&&typeof e==="object"&&"message" in e?String(e.message):"No se pudo corregir el monto.")}finally{bloqueo.current=false;setOcupado(false)}}
 const importe=(n:number)=>n.toLocaleString("es-EC",{minimumFractionDigits:2,maximumFractionDigits:2})
 return createPortal(<dialog ref={dialogo} className="fin-pagos-dialogo" aria-labelledby={titulo} onCancel={e=>{e.preventDefault();if(!bloqueado)cerrar()}}><form onSubmit={guardar}>
  <h2 id={titulo}>Corregir monto de nómina</h2><p>{cuenta.proveedor}<br/>{cuenta.numero_documento}</p><p>Pagos registrados: USD {importe(Number(cuenta.pagado))}. Se conservarán sus referencias e importes.</p>
  <fieldset disabled={bloqueado}><label>Total correcto USD <input aria-label="Total correcto de nómina" type="number" required min={Math.max(.01,Number(cuenta.pagado))} max="999999999.99" step="0.01" value={total} onChange={e=>setTotal(e.target.value)}/></label><label>Motivo <input aria-label="Motivo de corrección de nómina" required minLength={5} maxLength={500} value={motivo} onChange={e=>setMotivo(e.target.value)}/></label></fieldset>
  <p>Saldo resultante: <strong>USD {importe(Number(total)-Number(cuenta.pagado))}</strong></p><p>Se guardarán el valor anterior, el nuevo monto, el motivo y el responsable en la bitácora.</p>
  {error&&<p role="alert" className="compras-sri-error">{error}</p>}<div className="fin-pagos-filtros"><button disabled={ocupado}>{pendiente?"Reintentar corrección":"Guardar monto correcto"}</button><button type="button" disabled={bloqueado} onClick={cerrar}>Cancelar</button></div>
 </form></dialog>,document.body)
}
