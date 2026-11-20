import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {sugerirRetencionIva} from '../src/utils/sugerenciasRetencionIva.ts'
const sql=await readFile(new URL('../supabase/migrations/202611200007_historial_reglas_iva.sql',import.meta.url),'utf8')
const hash='a'.repeat(64)
const ruc=n=>String(n).padStart(10,'0')+'001'
async function preparar(t){
  const db=new PGlite();t.after(()=>db.close())
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$ select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
    create function fin_puede_modulo(text) returns boolean language sql stable as $$ select current_setting('test.cuentas',true)='si' $$;
    create function compras_sri_puede() returns boolean language sql stable as $$ select current_setting('test.sri',true)='si' $$;
    create table app_audit_log(actor_user_id uuid,accion text,detalle jsonb);
    create table fin_reglas_retencion(id text primary key,impuesto text,concepto text,porcentaje numeric,desde date,hasta date,fuente text);
    select set_config('test.cuentas','si',false);select set_config('test.sri','no',false);`)
  await db.exec(sql);await db.exec('set role authenticated')
  let indice=0
  const factura=(n,retenido,iva=15)=>({fila:++indice,pagina:1,ruc:ruc(n),proveedor:'Proveedor '+n,fecha:'2026-09-01',factura:'001-001-'+String(indice).padStart(9,'0'),iva,retenido})
  const datos=[...Array.from({length:3},()=>factura(1,4.5)),...Array.from({length:3},()=>factura(2,0)),
    factura(3,4.5),factura(3,10.5),...Array.from({length:3},()=>factura(4,0,0)),factura(5,4.5),
    ...Array.from({length:3},()=>factura(6,15)),...Array.from({length:3},()=>factura(7,.01,.02))]
  const cargar=(filas=datos,fuente=hash,hasta='2026-09-30')=>db.query("select fin_importar_historial_iva($1,'Prueba.pdf','2026-01-01',$2,$3)",[fuente,hasta,JSON.stringify(filas)])
  return {db,datos,cargar}
}
test('Carga idempotente: solo tasas positivas uniformes con tres muestras se sugieren; cero, mixto y escaso quedan revisables',async t=>{
  const {db,datos,cargar}=await preparar(t)
  await cargar();await cargar()
  const perfiles=(await db.query('select * from fin_consultar_perfiles_iva() order by ruc')).rows
  assert.equal(perfiles.length,7)
  assert.deepEqual(perfiles.map(p=>p.estado),['SUGERIDA','REVISAR_CERO','VARIABLE','SIN_IVA','INSUFICIENTE','SUGERIDA','VARIABLE'])
  assert.deepEqual(perfiles.map(p=>p.porcentaje_sugerido),[30,null,null,null,null,100,null])
  assert.equal(perfiles[0].con_iva,3)
  await assert.rejects(cargar([{...datos[0],retenido:5},...datos.slice(1)]),/ya se cargó con otros datos/)
  await assert.rejects(db.query('select * from fin_historial_iva'),/permission denied/)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from fin_historial_iva')).rows[0].n,datos.length)
  assert.equal((await db.query('select count(*)::int n from app_audit_log')).rows[0].n,1)
})
test('Una fuente más reciente sustituye el patrón del RUC sin sumar dos veces reportes solapados',async t=>{
  const {db,datos,cargar}=await preparar(t);await cargar()
  const nuevos=datos.slice(0,3).map(d=>({...d,retenido:10.5,fecha:'2026-10-01'}))
  await cargar(nuevos,'b'.repeat(64),'2026-10-31')
  const perfil=(await db.query('select * from fin_consultar_perfiles_iva() where ruc=$1',[ruc(1)])).rows[0]
  assert.equal(perfil.porcentaje_sugerido,70);assert.equal(perfil.facturas,3)
})
test('La carga rechaza filas inválidas, y solo Compras SRI o Cuentas pueden leer sin ampliar la importación',async t=>{
  const {db,datos,cargar}=await preparar(t)
  await assert.rejects(cargar([datos[0],datos[0]]),/Revisa las filas/)
  await assert.rejects(cargar([{...datos[0],ruc:'123'}]),/Revisa las filas/)
  await assert.rejects(cargar([{...datos[0],retenido:16}]),/Revisa las filas/)
  await cargar()
  await db.exec("select set_config('test.cuentas','no',false); select set_config('test.sri','si',false)")
  assert.equal((await db.query('select count(*)::int n from fin_consultar_perfiles_iva()')).rows[0].n,7)
  await assert.rejects(cargar(),/permiso para cargar/)
  await db.exec("select set_config('test.sri','no',false)")
  await assert.rejects(db.query('select * from fin_consultar_perfiles_iva()'),/permiso/)
  await db.exec('set role anon');await assert.rejects(cargar(),/permission denied/)
})
test('La sugerencia exige RUC exacto, fecha posterior, IVA positivo e historial suficiente y no presume retención en notas',()=>{
  const perfil={ruc:ruc(1),hasta:'2026-09-30',estado:'SUGERIDA',porcentaje_sugerido:30,con_iva:5}
  assert.equal(sugerirRetencionIva(perfil,ruc(1),'2026-11-20',15).monto,4.5)
  assert.equal(sugerirRetencionIva(perfil,ruc(2),'2026-11-20',15).monto,null)
  assert.equal(sugerirRetencionIva(perfil,ruc(1),'2026-09-30',15).monto,null)
  assert.equal(sugerirRetencionIva(perfil,ruc(1),'2026-11-20',null).monto,null)
  assert.equal(sugerirRetencionIva(perfil,ruc(1),'2026-11-20',0).monto,null)
  assert.equal(sugerirRetencionIva(perfil,ruc(1),'2026-11-20',15,true).monto,null)
  for(const estado of ['VARIABLE','REVISAR_CERO','INSUFICIENTE','SIN_IVA'])assert.equal(sugerirRetencionIva({...perfil,estado},ruc(1),'2026-11-20',15).monto,null)
})
