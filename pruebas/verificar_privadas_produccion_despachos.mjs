import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const tablas = [
 ['ped_solicitudes_registro','cibuspan-pedido-seguro-v1'],
 ['pro_solicitudes_registro','cibuspan-registro-produccion-v1'],
 ['log_solicitudes_operacion','cibuspan-logistica-segura-v1'],
 ['res_solicitudes_operacion','cibuspan-reservas-seguras-v1'],
 ['ed_solicitudes_despacho','cibuspan-edicion-despacho-v1'],
]
const sql = await readFile(new URL('../supabase/migrations/202611270004_privadas_produccion_despachos.sql',import.meta.url),'utf8')
const diagnostico = await readFile(new URL('../supabase/diagnosticos/verificar_privadas_produccion_despachos.sql',import.meta.url),'utf8')
test('Retira privilegios restaurados sin perder comprobantes; reaplicar conserva los datos',async()=>{
 const db=new PGlite()
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;grant usage on schema public to authenticated;')
  for(const [tabla,marca] of tablas) await db.exec(`create table ${tabla}(id integer primary key,datos jsonb);
   comment on table ${tabla} is '${marca}';alter table ${tabla} enable row level security;
   insert into ${tabla} values(1,'{"estado":"CONFIRMADA"}');
   grant truncate,references,trigger on ${tabla} to authenticated,service_role;`)
  assert.equal((await db.query(diagnostico)).rows[0].privadas_produccion_despachos.correcto,false)
  await db.exec(sql)
  await db.exec(sql)
  assert.equal((await db.query(diagnostico)).rows[0].privadas_produccion_despachos.correcto,true)
  for(const [tabla] of tablas) {
   assert.deepEqual((await db.query(`select * from ${tabla}`)).rows,[{id:1,datos:{estado:'CONFIRMADA'}}])
   await db.exec('set role authenticated')
   await assert.rejects(()=>db.exec(`truncate ${tabla}`),e=>e.code==='42501')
   await db.exec('reset role')
  }
  await db.exec("comment on table ped_solicitudes_registro is 'otro contrato'")
  await assert.rejects(()=>db.exec(sql),/no coincide/)
  await db.exec('rollback')
  assert.equal((await db.query('select count(*)::integer n from ped_solicitudes_registro')).rows[0].n,1)
 } finally {await db.close()}
})
