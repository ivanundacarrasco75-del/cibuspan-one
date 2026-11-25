import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
export async function preparar(t){
 const db=new PGlite();t.after(()=>db.close())
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select '${id(1)}'::uuid$$;
 grant usage on schema auth to authenticated;
 create table app_profiles(user_id uuid,activo boolean,rol text,email text);
 insert into app_profiles values('${id(1)}',true,'JEFA_FACTURACION','responsable@example.test');
 create table app_user_permissions(user_id uuid,pantalla text,permitido boolean);
 insert into app_user_permissions values('${id(1)}','Pagos y Finanzas · Cuentas por Cobrar',true),('${id(1)}','Pagos y Finanzas · Cobros y Conciliación',true);
 create function app_puede(text) returns boolean language sql stable as $$ select false $$;
 create table app_audit_log(id bigint generated always as identity,actor_user_id uuid,accion text,detalle jsonb,creado_en timestamptz default now());
 create table com_ventas_detalle(id uuid primary key,comprobante text,fecha_emision date,cliente_nombre text,total_sin_impuestos numeric);
 insert into com_ventas_detalle values('${id(10)}','F-1','2026-11-01','Cliente',100),('${id(11)}','F-1','2026-11-01','Cliente',100),
 ('${id(12)}','F-2','2026-11-01','Cliente',200),('${id(13)}','F-3','2026-11-01','Cliente',200);`)
 await db.exec(await readFile(new URL('../supabase/migrations/202611240003_cobros_conciliacion.sql',import.meta.url),'utf8'))
 await db.exec('set role authenticated')
 const consultar=async()=>(await db.query("select * from fin_cxc_consultar('2026-01-01','2026-12-31','') order by comprobante")).rows
 const confirmar=async(n,total=200)=>{const f=(await consultar()).find(f=>f.comprobante==='F-'+n);return db.query("select fin_cxc_confirmar_factura($1,$2,$3,$4,'2026-11-30','Verificado contra factura')",[f.comprobante,f.revision,f.huella,total])}
 const depositar=(n=20,monto=580,referencia='DEP-01')=>db.query("select fin_cxc_crear_deposito($1,'Banco / cuenta1',$2,'2026-11-24',$3,'Cliente','Ingreso verificado')",[id(n),referencia,monto])
 const depositos=async()=>(await db.query('select * from fin_cxc_consultar_depositos()')).rows
 const fila=async(n,efectivo,retencion=0,referencia='RET-01')=>{const f=(await consultar()).find(f=>f.comprobante==='F-'+n);return {comprobante:f.comprobante,huella:f.huella,revision:f.revision,saldo:Number(f.saldo),efectivo,retencion,referencia_retencion:referencia,fecha_retencion:'2026-11-24'}}
 const conciliar=(n,filas,deposito=id(20))=>db.query("select fin_cxc_conciliar($1,$2,$3,'Cobros y retenciones verificados')",[id(n),deposito,JSON.stringify(filas)])
 const historial=async(n)=>(await db.query('select fin_cxc_historial($1) datos',['F-'+n])).rows[0].datos
 return {db,consultar,confirmar,depositar,depositos,fila,conciliar,historial}
}
test('Un depósito paga tres facturas con retención, sin convertir la retención en dinero bancario y sin duplicar al reintentar',async t=>{
 const {consultar,confirmar,depositar,depositos,fila,conciliar,historial}=await preparar(t)
 assert.equal((await consultar()).length,3);assert.equal(Number((await consultar())[0].subtotal_importado),200)
 assert.equal((await consultar())[0].verificada,false)
 for(let i=1;i<=3;i++)await confirmar(i)
 await depositar();await depositar()
 const filas=[await fila(1,180,20),await fila(2,200),await fila(3,200)]
 await conciliar(30,filas);await conciliar(30,filas)
 assert.deepEqual((await consultar()).map(f=>Number(f.saldo)),[0,0,0])
 assert.equal(Number((await depositos())[0].aplicado),580);assert.equal(Number((await depositos())[0].disponible),0)
 assert.equal((await historial(1)).length,1);assert.equal((await historial(1))[0].responsable,'responsable@example.test')
})
test('Depósito parcial mantiene dinero pendiente; retención sin depósito y anulaciones restauran ambos saldos',async t=>{
 const {db,consultar,confirmar,depositar,depositos,fila,conciliar,historial}=await preparar(t)
 await confirmar(1);await depositar(20,300)
 await conciliar(30,[await fila(1,80,20)])
 assert.equal(Number((await depositos())[0].disponible),220)
 assert.equal(Number((await consultar())[0].saldo),100)
 await conciliar(31,[await fila(1,0,10,'RET-02')],null)
 assert.equal(Number((await consultar())[0].saldo),90)
 assert.equal(Number((await depositos())[0].disponible),220)
 await assert.rejects(db.query("select fin_cxc_anular(null,$1,'Anulación de prueba')",[id(20)]),/Primero anula/)
 const aplicaciones=await historial(1)
 for(const a of aplicaciones)await db.query("select fin_cxc_anular($1,null,'Cruce equivocado confirmado')",[a.id])
 assert.equal(Number((await consultar())[0].saldo),200);assert.equal(Number((await depositos())[0].disponible),300)
 assert((await historial(1)).every(a=>a.anulada))
 await db.query("select fin_cxc_anular(null,$1,'Depósito equivocado confirmado')",[id(20)])
 assert.equal((await depositos())[0].anulado,true)
})
test('Bloquea facturas sin total confirmado, exceso de depósito/saldo, retención sin referencia, duplicados y operaciones reutilizadas',async t=>{
 const {db,consultar,confirmar,depositar,fila,conciliar}=await preparar(t)
 await depositar(20,100)
 await assert.rejects(conciliar(30,[await fila(1,10)]),/falta confirmar/)
 await confirmar(1)
 await assert.rejects(conciliar(30,[await fila(1,101)]),/disponible/)
 await assert.rejects(conciliar(30,[await fila(1,90,120)]),/supera el saldo/)
 await assert.rejects(conciliar(30,[await fila(1,90,10,'')]),/número de comprobante/)
 await assert.rejects(conciliar(30,[await fila(1,-1,5)]),/importes aplicados/)
 await assert.rejects(depositar(21,100),/unique constraint/)
 await conciliar(30,[await fila(1,50,10)])
 await assert.rejects(conciliar(31,[await fila(1,0,10)]),/unique constraint/)
 await assert.rejects(conciliar(30,[await fila(1,5)]),/otros datos/)
 const f=(await consultar())[0]
 await assert.rejects(db.query("select fin_cxc_confirmar_factura($1,$2,$3,20,'2026-11-30','Corrección de prueba')",[f.comprobante,f.revision,f.huella]),/menor que los cobros/)
})
test('Cambios en ventas y saldos concurrentes exigen revisar antes de conciliar; la reimportación no duplica facturas',async t=>{
 const {db,consultar,confirmar,depositar,fila,conciliar}=await preparar(t)
 await confirmar(1);await depositar(20,300)
 const antigua=await fila(1,50)
 await conciliar(30,[await fila(1,20)])
 await assert.rejects(conciliar(31,[antigua]),/factura cambió/)
 await db.exec(`reset role;update com_ventas_detalle set total_sin_impuestos=110 where id='${id(10)}';set role authenticated`)
 assert.equal((await consultar())[0].verificada,false)
 await assert.rejects(conciliar(31,[await fila(1,50)]),/factura cambió/)
 await confirmar(1,210);assert.equal((await consultar()).length,3)
 await conciliar(31,[await fila(1,50)])
 await db.exec(`reset role;update com_ventas_detalle set cliente_nombre='Otro cliente' where id='${id(10)}';set role authenticated`)
 assert.equal((await consultar())[0].fuente_valida,false)
 await assert.rejects(confirmar(1,210),/clientes\/fechas/)
})
test('Permisos separados para completar facturas y conciliar, sin escrituras directas ni acceso anónimo',async t=>{
 const {db,consultar,confirmar,depositar}=await preparar(t)
 await db.exec("reset role;update app_user_permissions set permitido=false where pantalla like '%Cobros y%';set role authenticated")
 await confirmar(1)
 await assert.rejects(depositar(),/No tienes permiso/)
 await assert.rejects(db.query("update fin_cxc_facturas set total=1"),/permission denied/)
 await db.exec("reset role;update app_user_permissions set permitido=not permitido;set role authenticated")
 await depositar();await assert.rejects(confirmar(2),/No tienes permiso/)
 assert.equal((await consultar()).length,3)
 await db.exec("reset role;update app_user_permissions set permitido=false;set role authenticated")
 await assert.rejects(consultar(),/No tienes permiso/)
 await db.exec('reset role;set role anon')
 await assert.rejects(consultar(),/permission denied/)
})
