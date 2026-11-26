import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {preparar} from './verificar_anticipos_sql.mjs';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'),sri='sri:'+'1'.repeat(49);
async function entorno(t){const e=await preparar(t);const antes=(await e.db.query('select to_jsonb(c) datos from fin_consultar_cuentas() c order by id')).rows;await e.db.exec('reset role');await e.db.exec(await readFile(new URL('../supabase/migrations/202611260002_semanas_pago_documentos.sql',import.meta.url),'utf8'));await e.db.exec('set role authenticated');const despues=(await e.db.query('select to_jsonb(c)-\'semana_pago\' datos from fin_consultar_cuentas() c order by id')).rows;assert.deepEqual(despues,antes);const guardar=(op,doc,semana,anterior=null)=>e.db.query('select fin_guardar_semana_pago($1,$2,$3,$4)',[id(op),doc,semana,anterior]);const semana=async doc=>(await e.db.query('select fin_fecha_semana_pago($1)::text semana',[doc])).rows[0].semana;return {...e,guardar,semana};}
test('Semana prevista se normaliza a lunes, filtra antes de paginar, admite edición y limpieza, sin programar ni pagar',async t=>{
 const {db,guardar,semana,crear}=await entorno(t);await crear(10);await db.exec('reset role');await db.query("insert into compras_documentos_manuales(id,tipo,fecha_documento,proveedor,concepto,subtotal) values($1,'NO_DEDUCIBLE','2026-11-26','Proveedor','Prueba',100)",[id(90)]);await db.exec('set role authenticated');
 for(const [i,doc] of [sri,'manual:'+id(90),'anticipo:'+id(10)].entries()){await guardar(100+i,doc,'2026-12-03');assert.equal(await semana(doc),'2026-11-30')}
 assert.equal((await db.query("select count(*) n from fin_consultar_cuentas() where semana_pago='2026-11-30'")).rows[0].n,3);
 await guardar(110,sri,'2026-12-10','2026-11-30');assert.equal(await semana(sri),'2026-12-07');await guardar(111,sri,null,'2026-12-07');assert.equal(await semana(sri),null);
 await db.exec('reset role');assert.equal(Number((await db.query('select count(*) n from fin_programacion_compras')).rows[0].n),0);assert.equal(Number((await db.query('select count(*) n from fin_pagos_compras')).rows[0].n),0);
});
test('Idempotencia, control concurrente, bitácora, fecha inválida y permisos sin escritura directa',async t=>{
 const {db,guardar,semana}=await entorno(t);await guardar(100,sri,'2026-12-03');await guardar(100,sri,'2026-12-03');await assert.rejects(guardar(100,sri,'2026-12-10'),/otros datos/);await assert.rejects(guardar(101,sri,'2026-12-10'),/La semana cambió/);assert.equal(await semana(sri),'2026-11-30');await assert.rejects(guardar(102,sri,'infinity','2026-11-30'),/Revisa la semana/);
 await assert.rejects(db.exec('select * from fin_semanas_pago_documentos'),/permission denied/);
 await db.exec("reset role;update app_user_permissions set permitido=false;set role authenticated");await assert.rejects(guardar(103,sri,'2026-12-10','2026-11-30'),/No tienes permiso/);
 await db.exec('reset role');const a=(await db.query("select detalle from app_audit_log where accion='FIN_SEMANA_PAGO_EDITAR'")).rows;assert.equal(a.length,1);assert.equal(a[0].detalle.semana,'2026-11-30');await db.exec('set role anon');await assert.rejects(guardar(104,sri,'2026-12-01'),/permission denied/);
});

test('Una vinculación Excel/SRI conserva la semana y ambos accesos comparten edición y limpieza',async t=>{
 const {db,guardar,semana}=await entorno(t),excel='excel:'+id(40);
 await db.exec(`reset role;insert into compras_excel_cargas values('${'a'.repeat(64)}','Prueba.xlsx','Hoja1',2026,'{}',now());insert into compras_excel_documentos(id,archivo_hash,tipo,numero,proveedor,descripcion,total,neto,pagado,pagos,observaciones,filas) values('${id(40)}','${'a'.repeat(64)}','FACTURA','F-1','Proveedor Prueba','Material',300,300,0,'[]','','[]');set role authenticated;`);
 await guardar(200,excel,'2026-12-03');await db.exec(`reset role;update compras_excel_documentos set sri_clave='${'1'.repeat(49)}';set role authenticated;`);
 assert.equal(await semana(sri),'2026-11-30');assert.equal(await semana(excel),'2026-11-30');
 await guardar(201,sri,'2026-12-10','2026-11-30');assert.equal(await semana(excel),'2026-12-07');await guardar(202,excel,null,'2026-12-07');assert.equal(await semana(sri),null);
});

test('Solo Pagos semanales permite consultar, no editar; permiso de notas no habilita SRI ni gastos',async t=>{
 const {db,guardar,semana}=await entorno(t);await guardar(300,sri,'2026-12-03');
 await db.exec("reset role;update app_user_permissions set permitido=(pantalla='Pagos y Finanzas · Pagos semanales');set role authenticated");
 assert.equal(await semana(sri),'2026-11-30');await assert.rejects(guardar(301,sri,'2026-12-10','2026-11-30'),/No tienes permiso/);
 await db.exec(`reset role;update app_user_permissions set permitido=false;insert into app_user_permissions values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Compras · Notas de venta',true);insert into compras_documentos_manuales(id,tipo,fecha_documento,numero_documento,proveedor,concepto,subtotal) values('${id(90)}','NOTA_VENTA','2026-11-26','NV-1','Proveedor','Prueba',100),('${id(91)}','NO_DEDUCIBLE','2026-11-26',null,'Proveedor','Prueba',100);set role authenticated;`);
 await guardar(302,'manual:'+id(90),'2026-12-03');await assert.rejects(guardar(303,'manual:'+id(91),'2026-12-03'),/No tienes permiso/);await assert.rejects(guardar(304,sri,'2026-12-10','2026-11-30'),/No tienes permiso/);
});

