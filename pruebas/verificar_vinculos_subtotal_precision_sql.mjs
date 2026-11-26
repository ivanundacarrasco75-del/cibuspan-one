import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {preparar} from './verificar_sueldo_retenciones_sql.mjs'
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
const clave='1111202601179093491800120010010002865501234567819'
const migracion=()=>readFile(new URL('../supabase/migrations/202611260004_vinculos_subtotal_precision.sql',import.meta.url),'utf8')
async function entorno(t,{subtotal='171.860000',total='197.64',proveedor='ESCOBAR RUIZ CARTONERA PICHINCHA',pago=0}={}){
 const e=await preparar(t),{db}=e
 await db.exec('reset role')
 await db.query("insert into compras_excel_cargas values($1,'Prueba.xlsx','Hoja1',2026,'{}',now())",['c'.repeat(64)])
 await db.query("insert into compras_excel_documentos(id,archivo_hash,tipo,numero,proveedor,descripcion,fecha,total,iva,neto,pagado,pagos,observaciones,filas) values($1,$2,'FACTURA','FACT 286550',$3,'Material','2026-11-11',197.64,25.78,194.20,$4,'[]','','[]')",[id(80),'c'.repeat(64),proveedor,pago])
 await db.exec('set role authenticated')
 const datos={clave,ruc:'1790934918001',serie:'001-001-000286550',fecha:'2026-11-11',proveedor:'CARTONERA PICHINCHA - ESCOBAR RUIZ CIA. LTDA.',subtotal,total,descuento:'0.00',impuestos:[{codigo:'2',base:subtotal,valor:'25.78'}],items:[]}
 const cargar=()=>db.query("insert into compras_sri(clave_acceso,fecha_emision,datos,xml_original) values($1,'2026-11-11',$2,'<xml-prueba/>') on conflict do nothing",[clave,JSON.stringify(datos)])
 const revision=async()=>(await db.query('select * from compras_vinculos_excel where clave=$1',[clave])).rows[0]
 const resolver=async()=>db.query("select compras_resolver_vinculo_excel($1,$2,$3,'Usuario confirmó que es la misma factura',true)",[clave,(await revision()).revision,id(80)])
 const instalar=async()=>{await db.exec('reset role');await db.exec(await migracion());await db.exec('set role authenticated')}
 return {...e,cargar,resolver,instalar,revision}
}
test('Subtotal 171.860000 reproduce el bloqueo y se vincula sin cambiar neto, pagos, plan ni XML',async t=>{
 const {db,cargar,resolver,instalar,revision,cuenta}=await entorno(t,{pago:100})
 await db.query("select fin_programar_compras('2026-11-23',$1)",[JSON.stringify([{id:'excel:'+id(80),monto:50}])])
 await cargar();assert.equal((await revision()).estado,'REVISION');await assert.rejects(resolver(),/Revisa los importes del XML/)
 const plan=(await db.query('select * from fin_consultar_programaciones()')).rows
 await instalar();await instalar();await resolver();await resolver()
 assert.equal((await revision()).estado,'VINCULADA')
 const c=await cuenta('excel:'+id(80));assert.equal(Number(c.neto),194.2);assert.equal(Number(c.pagado),100);assert.equal(Number(c.saldo),94.2);assert.equal(await cuenta('sri:'+clave),undefined)
 assert.deepEqual((await db.query('select * from fin_consultar_programaciones()')).rows,plan)
 await db.exec('reset role');const s=(await db.query('select datos,xml_original from compras_sri where clave_acceso=$1',[clave])).rows[0];assert.equal(s.datos.subtotal,'171.860000');assert.equal(s.xml_original,'<xml-prueba/>');assert.equal(Number((await db.query('select count(*) n from fin_pagos_compras')).rows[0].n),0);assert.equal(Number((await db.query("select count(*) n from app_audit_log where accion='COMPRAS_VINCULAR_EXCEL_SRI'")).rows[0].n),1)
})
test('La vinculación automática también admite la precisión original del XML',async t=>{
 const {cargar,instalar,revision}=await entorno(t,{proveedor:'CARTONERA PICHINCHA - ESCOBAR RUIZ CIA. LTDA.'});await instalar();await cargar();assert.equal((await revision()).estado,'VINCULADA');assert.equal((await revision()).automatico,true)
})
test('Mantiene rechazo de texto inválido y diferencias monetarias reales',async t=>{
 for(const caso of [{subtotal:'171.86x',error:/Revisa los importes/},{total:'197.65',error:/importes difieren/},{subtotal:'171.85',error:/importes difieren/}]){
  const {cargar,instalar,resolver,revision}=await entorno(t,caso);await instalar();await cargar();await assert.rejects(resolver(),caso.error);assert.equal((await revision()).estado,'REVISION')
 }
})
