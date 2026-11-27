import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {preparar} from './verificar_sueldo_retenciones_sql.mjs'
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'),doc='sri:'+'1'.repeat(49),anticipo=id(50),ant='anticipo:'+anticipo
async function entorno(t){
  const e=await preparar(t),{db}=e
  await db.exec('reset role')
  for(const nombre of ['202611260002_semanas_pago_documentos','202611260003_compras_retenciones_reportes'])
    await db.exec(await readFile(new URL('../supabase/migrations/'+nombre+'.sql',import.meta.url),'utf8'))
  const antes=(await db.query('select to_jsonb(c) datos from fin_consultar_cuentas() c order by id')).rows
  await db.exec(await readFile(new URL('../supabase/migrations/202611270005_anticipos_retencion_pendiente.sql',import.meta.url),'utf8'))
  assert.deepEqual((await db.query('select to_jsonb(c) datos from fin_consultar_cuentas() c order by id')).rows,antes)
  await db.query("update compras_sri set datos=datos||jsonb_build_object('total','224.83','subtotal','195.50','impuestos',jsonb_build_array(jsonb_build_object('codigo','2','valor','29.33'))) where clave_acceso=$1",['1'.repeat(49)])
  await db.exec('set role authenticated')
  await db.query("select fin_guardar_anticipo($1,'2026-11-01','Proveedor','1790000000001','Materiales',224.83)",[anticipo])
  await db.query("select fin_pagar_compra($1,$2,212.12,'2026-11-20','DEP-ORIGINAL',null,false)",[ant,id(51)])
  await db.query('select fin_aplicar_anticipo($1,$2,$3,212.12,true)',[id(52),anticipo,doc])
  const liquidar=(ret=12.71,op=60,monto=224.83,pagado=212.12)=>db.query('select fin_liquidar_anticipo_retencion($1,$2,$3,$4,$5,$6,$7)',[id(op),anticipo,doc,monto,pagado,ret,'Diferencia confirmada como retención pendiente'])
  return {...e,liquidar}
}

test('Anticipo retenido: deja ambos saldos en cero, preserva banco/cruce/XML y audita el importe anterior',async t=>{
  const {db,cuenta,liquidar}=await entorno(t)
  assert.equal(Number((await cuenta(ant)).saldo),12.71)
  assert.equal(Number((await cuenta(doc)).saldo),12.71)
  await db.query("select fin_programar_compras('2026-11-23',$1)",[JSON.stringify([{id:ant,monto:12.71},{id:doc,monto:12.71}])])
  await db.exec('reset role')
  const originales=(await db.query("select (select jsonb_agg(to_jsonb(p)) from fin_pagos_compras p) pagos,(select jsonb_agg(to_jsonb(a)) from fin_anticipos_aplicaciones a) cruces,(select jsonb_agg(to_jsonb(s)) from compras_sri s) facturas")).rows
  await db.exec('set role authenticated')
  await liquidar();await liquidar()
  assert.equal(Number((await cuenta(ant)).saldo),0);assert.equal(Number((await cuenta(ant)).total),212.12)
  assert.equal(Number((await cuenta(doc)).saldo),0);assert.equal(Number((await cuenta(doc)).retencion),12.71)
  assert.equal(Number((await cuenta(doc)).pagado),212.12)
  const r=(await db.query('select * from fin_retenciones_documentos')).rows[0]
  assert.equal(r.tipo_registro,'CALCULADA');assert.equal(r.comprobante,'');assert.equal(r.regimen,null)
  assert.equal(r.lineas[0].impuesto,'TOTAL_RETENIDO');assert.equal(Number(r.descuento),12.71)
  assert.equal(Number((await db.query('select neto_excel from compras_vw_facturas')).rows[0].neto_excel),212.12)
  await assert.rejects(liquidar(12.70),/otros datos/)
  await db.exec('reset role')
  assert.deepEqual((await db.query("select (select jsonb_agg(to_jsonb(p)) from fin_pagos_compras p) pagos,(select jsonb_agg(to_jsonb(a)) from fin_anticipos_aplicaciones a) cruces,(select jsonb_agg(to_jsonb(s)) from compras_sri s) facturas")).rows,originales)
  assert.equal(Number((await db.query('select count(*) n from fin_programacion_compras')).rows[0].n),0)
  const audit=(await db.query("select detalle from app_audit_log where accion='FIN_LIQUIDAR_ANTICIPO_RETENCION'")).rows
  assert.equal(audit.length,1);assert.equal(Number(audit[0].detalle.anticipo_anterior.monto),224.83)
})

test('Anticipo retenido: rechaza diferencias, vista desactualizada y permisos sin cambios parciales',async t=>{
  const {db,liquidar,cuenta}=await entorno(t)
  await assert.rejects(liquidar(12),/diferencia/)
  await assert.rejects(liquidar(12.71,61,225),/cambió/)
  await assert.rejects(liquidar(12.71,61,224.83,200),/cambió/)
  assert.equal(Number((await cuenta(ant)).saldo),12.71)
  await db.exec('reset role')
  assert.equal(Number((await db.query('select count(*) n from fin_anticipos_ajustes_retencion')).rows[0].n),0)
  assert.equal(Number((await db.query('select count(*) n from fin_retenciones_documentos')).rows[0].n),0)
  await db.exec('update app_user_permissions set permitido=false;set role authenticated')
  await assert.rejects(liquidar(),/permiso/)
  await assert.rejects(db.exec('select * from fin_anticipos_ajustes_retencion'),/permission denied/)
  await db.exec('set role anon');await assert.rejects(liquidar(),/permission denied/)
})

test('Anticipo retenido: anular el cálculo reabre solo la factura y puede sustituirse por reglas verificadas',async t=>{
  const {db,liquidar,cuenta}=await entorno(t);await liquidar()
  await db.query("select fin_anular_retencion($1,'Corrección confirmada')",[id(60)])
  assert.equal(Number((await cuenta(ant)).saldo),0);assert.equal(Number((await cuenta(doc)).saldo),12.71)
  await db.query("select fin_guardar_calculo_retencion($1,$2,'2026-11-27','GENERAL',false,'','Desglose verificado',$3,true)",[id(61),doc,JSON.stringify([{regla:'IR_BIENES_2026',base:195.5,valor:3.91},{regla:'IVA_BIENES',base:29.33,valor:8.8}])])
  assert.equal(Number((await cuenta(doc)).saldo),0);assert.equal(Number((await cuenta(ant)).saldo),0)
})

test('Anticipo retenido: conserva una retención emitida coincidente',async t=>{
  const {db,liquidar,cuenta}=await entorno(t)
  await db.query("select fin_aplicar_retencion($1,$2,'2026-11-27','GENERAL',false,'RET-REAL','Desglose verificado',$3,true)",[id(59),doc,JSON.stringify([{regla:'IR_BIENES_2026',base:195.5,valor:3.91},{regla:'IVA_BIENES',base:29.33,valor:8.8}])])
  await liquidar();assert.equal(Number((await cuenta(ant)).saldo),0)
  const filas=(await db.query('select * from fin_retenciones_documentos')).rows
  assert.equal(filas.length,1);assert.equal(filas[0].comprobante,'RET-REAL');assert.equal(filas[0].tipo_registro,'EMITIDA')
})

test('Anticipo retenido: bloquea retención distinta, proveedor cambiado y cruces de varias facturas',async t=>{
  const {db,liquidar}=await entorno(t)
  await db.query("select fin_guardar_calculo_retencion($1,$2,'2026-11-27','GENERAL',false,'','Desglose verificado',$3,true)",[id(59),doc,JSON.stringify([{regla:'IR_BIENES_2026',base:195.5,valor:3.91},{regla:'IVA_BIENES',base:29.33,valor:4}])])
  await assert.rejects(liquidar(),/otra retención/)
  await db.query("select fin_anular_retencion($1,'Prueba de validación')",[id(59)])
  await db.exec("reset role;update fin_anticipos set ruc='9999999999001';set role authenticated")
  await assert.rejects(liquidar(),/misma factura/)
  await db.exec("reset role;update fin_anticipos set ruc='1790000000001'")
  await db.query("update fin_anticipos_aplicaciones set monto=100 where anticipo_id=$1",[anticipo])
  await db.query("insert into fin_anticipos_aplicaciones(id,anticipo_id,factura_id,numero_factura,proveedor_factura,monto,documento_anticipo,fecha_pago,referencias_pago,aplicado_por) select $1,anticipo_id,'sri:OTRA','F-OTRA',proveedor_factura,112.12,documento_anticipo,fecha_pago,referencias_pago,aplicado_por from fin_anticipos_aplicaciones where anticipo_id=$2",[id(53),anticipo])
  await db.exec('set role authenticated');await assert.rejects(liquidar(),/único cruce/)
})

test('Anticipo retenido: cualquier fallo revierte la retención, el importe y el registro de operación',async t=>{
  const {db,liquidar,cuenta}=await entorno(t)
  await db.exec("reset role;create function fallo_auditoria() returns trigger language plpgsql as $$ begin if new.accion='FIN_LIQUIDAR_ANTICIPO_RETENCION' then raise exception 'Fallo de prueba';end if;return new;end $$;create trigger fallo before insert on app_audit_log for each row execute function fallo_auditoria();set role authenticated")
  await assert.rejects(liquidar(),/Fallo de prueba/)
  assert.equal(Number((await cuenta(ant)).total),224.83);assert.equal(Number((await cuenta(ant)).saldo),12.71)
  assert.equal(Number((await cuenta(doc)).saldo),12.71)
  await db.exec('reset role')
  assert.equal(Number((await db.query('select count(*) n from fin_anticipos_ajustes_retencion')).rows[0].n),0)
  assert.equal(Number((await db.query('select count(*) n from fin_retenciones_documentos')).rows[0].n),0)
})
