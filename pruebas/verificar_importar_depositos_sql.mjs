import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {preparar} from './verificar_cobros_conciliacion_sql.mjs'
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
async function entorno(t){
 const e=await preparar(t);await e.db.exec('reset role');await e.db.exec(await readFile(new URL('../supabase/migrations/202611240004_importar_depositos.sql',import.meta.url),'utf8'));await e.db.exec('set role authenticated')
 const fila=(n,monto=100)=>({id:id(n),fecha:'2026-11-24',referencia:'BANCO-'+n,monto,ordenante:'',observaciones:'Pendiente de identificar'})
 const importar=(n,filas)=>e.db.query('select fin_cxc_importar_depositos($1,$2,$3,$4,$5,$6) resultado',[id(n),'noviembre.xlsx','a'.repeat(64),'02005231686','CORRIENTE',JSON.stringify(filas)])
 return {...e,importar,nueva:fila}
}
test('Importación atómica y auditada: reintentos, duplicados históricos y preservación de cobros aplicados',async t=>{
 const {db,importar,nueva,depositos,confirmar,fila,conciliar,consultar}=await entorno(t)
 const lote=[nueva(90),nueva(91,200)]
 assert.deepEqual((await importar(100,lote)).rows[0].resultado,{creados:2,duplicados:0,importe_creado:300,importe_duplicado:0})
 await importar(100,lote);assert.equal((await depositos()).length,2)
 await confirmar(1);await conciliar(50,[await fila(1,80,20)],id(90))
 assert.deepEqual((await importar(101,lote)).rows[0].resultado,{creados:0,duplicados:2,importe_creado:0,importe_duplicado:300})
 const d=(await depositos()).find(d=>d.id===id(90));assert.equal(Number(d.aplicado),80);assert.equal(Number(d.disponible),20);assert.equal(Number((await consultar())[0].saldo),100)
 const mismo={...lote[0],id:id(92),observaciones:'Otro archivo'};assert.equal((await importar(102,[mismo])).rows[0].resultado.duplicados,1)
 await db.exec('reset role');assert.equal(Number((await db.query("select count(*) n from app_audit_log where accion='FIN_CXC_DEPOSITO_CREAR'")).rows[0].n),2)
 assert.equal(Number((await db.query("select count(*) n from app_audit_log where accion='FIN_CXC_IMPORTAR_DEPOSITOS'")).rows[0].n),3)
})
test('Conflictos e importes inválidos revierten el lote completo; no reutiliza operación ni resucita anulados',async t=>{
 const {db,importar,nueva,depositos}=await entorno(t)
 await importar(100,[nueva(91)])
 await assert.rejects(importar(101,[nueva(90,50),nueva(91,101)]),/otros datos o importe/);assert.equal((await depositos()).length,1)
 for(const fila of [nueva(92,-1),{...nueva(92),referencia:''},nueva(92,1.001)])await assert.rejects(importar(102,[fila]))
 await assert.rejects(importar(103,[nueva(92),nueva(92)]),/referencias repetidas/)
 await assert.rejects(importar(100,[nueva(93)]),/otros datos/)
 await db.query("select fin_cxc_anular(null,$1,'Ingreso equivocado confirmado')",[id(91)])
 await assert.rejects(importar(104,[nueva(91)]),/fue anulada/)
 assert.equal((await depositos()).length,1)
})
test('Importar requiere permiso de Cobros; no habilita escritura directa ni acceso anónimo',async t=>{
 const {db,importar,nueva}=await entorno(t)
 await db.exec("reset role;update app_user_permissions set permitido=false where pantalla like '%Cobros y%';set role authenticated")
 await assert.rejects(importar(100,[nueva(90)]),/No tienes permiso/)
 await assert.rejects(db.query('select * from fin_cxc_importaciones'),/permission denied/)
 await db.exec('reset role;set role anon');await assert.rejects(importar(100,[nueva(90)]),/permission denied/)
})
