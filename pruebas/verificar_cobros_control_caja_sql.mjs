import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {preparar} from './verificar_cobros_conciliacion_sql.mjs';
async function entorno(t){const e=await preparar(t);await e.db.exec('reset role');await e.db.exec(await readFile(new URL('../supabase/migrations/202611240005_cobros_control_caja.sql',import.meta.url),'utf8'));await e.db.exec('set role authenticated');const caja=async(n,efectivo,retencion)=>{const f=await e.fila(n,efectivo,retencion);delete f.referencia_retencion;delete f.fecha_retencion;return f};return {...e,caja};}
test('Concilia caja sin número ni fecha de retención, sin convertirla en dinero, y conserva auditoría y reintento',async t=>{
 const {db,confirmar,depositar,caja,conciliar,consultar,depositos,historial}=await entorno(t);await confirmar(1);await depositar(20,196);const filas=[await caja(1,196,4)];await conciliar(30,filas);await conciliar(30,filas);
 assert.equal(Number((await consultar())[0].saldo),0);assert.equal(Number((await depositos())[0].aplicado),196);assert.equal(Number((await depositos())[0].disponible),0);
 const h=await historial(1);assert.equal(h.length,1);assert.equal(h[0].referencia_retencion,'');assert.equal(h[0].fecha_retencion,null);assert.equal(Number(h[0].retencion),4);
 await db.exec('reset role');const audit=(await db.query("select detalle from app_audit_log where accion='FIN_CXC_CONCILIAR'")).rows;assert.equal(audit.length,1);assert.equal(audit[0].detalle.alcance,'CONTROL_CAJA');assert.equal(audit[0].detalle.retenciones_sin_comprobante,1);
});
test('Admite aplicaciones parciales sin soportes y sus anulaciones restauran factura y depósito',async t=>{
 const {db,confirmar,depositar,caja,conciliar,consultar,depositos,historial}=await entorno(t);await confirmar(1);await depositar(20,500);await conciliar(30,[await caja(1,96,2)]);await conciliar(31,[await caja(1,100,2)]);
 assert.equal((await historial(1)).length,2);assert.equal(Number((await consultar())[0].saldo),0);assert.equal(Number((await depositos())[0].aplicado),196);
 for(const a of await historial(1))await db.query("select fin_cxc_anular($1,null,'Corrección de control de caja')",[a.id]);assert.equal(Number((await consultar())[0].saldo),200);assert.equal(Number((await depositos())[0].disponible),500);
});
test('Conserva soportes existentes y unicidad contable, valida el lote completo y exige permiso de Cobros',async t=>{
 const {db,confirmar,depositar,caja,fila,conciliar,consultar,depositos}=await entorno(t);await confirmar(1);await confirmar(2);await depositar(20,500);
 await conciliar(30,[await fila(1,0,2,'RET-EXISTENTE')],null);
 await assert.rejects(conciliar(31,[await fila(1,0,2,'RET-EXISTENTE')],null),/unique constraint/);
 const incompleta=await fila(1,0,2,'RET-OTRA');incompleta.fecha_retencion=null;await assert.rejects(conciliar(32,[incompleta],null),/datos contables opcionales/);
 await assert.rejects(conciliar(33,[await caja(1,100,2),await caja(2,198,4)]),/supera el saldo/);assert.equal(Number((await consultar())[0].saldo),198);assert.equal(Number((await depositos())[0].aplicado),0);
 await db.exec("reset role;update app_user_permissions set permitido=false where pantalla like '%Cobros y%';set role authenticated");await assert.rejects(conciliar(34,[await caja(1,100,2)]),/No tienes permiso/);await assert.rejects(db.query('update fin_cxc_aplicaciones set retencion=0'),/permission denied/);
});
