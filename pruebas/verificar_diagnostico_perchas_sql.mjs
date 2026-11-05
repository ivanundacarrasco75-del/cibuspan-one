import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {clasificarFotosPercha} from '../scripts/lib/fotosPerchaStorage.mjs'
if(!process.env.CIBUSPAN_SQL_TEST_MODULE)throw Error('Indica el modulo aislado PGlite; nunca usar la base real para este test.')
const {PGlite}=await import(pathToFileURL(process.env.CIBUSPAN_SQL_TEST_MODULE).href)
const db=new PGlite()
const consulta=readFileSync(new URL('../supabase/diagnosticos/diagnostico_fotos_percha.sql',import.meta.url),'utf8')
const uid='11111111-1111-4111-8111-111111111111',ruta=n=>`${uid}/2026-11-05/${n}`
try{
 await db.exec(`create schema storage;create table storage.objects(id uuid,bucket_id text,name text,updated_at timestamptz,metadata jsonb);create table com_visitas_campo_sku(capturas_app text[] not null,fotos_percha text[] not null);`)
 await test('SQL de solo lectura genera inventario; protege captura con nombre percha y no cambia filas',async()=>{
  await db.query('insert into com_visitas_campo_sku values($1,$2)',[[ruta('captura-1.png'),ruta('percha-protegida.png')],[ruta('percha-1.jpg'),ruta('percha-protegida.png')]])
  for(const [id,bucket,name,bytes]of[
   ['22222222-2222-4222-8222-000000000001','visitas-campo',ruta('percha-1.jpg'),'4500000000'],
   ['22222222-2222-4222-8222-000000000002','visitas-campo',ruta('captura-1.png'),'30000'],
   ['22222222-2222-4222-8222-000000000003','visitas-campo',ruta('percha-protegida.png'),'4000'],
   ['22222222-2222-4222-8222-000000000004','otro-bucket',ruta('percha-otro.jpg'),'1000'],
  ])await db.query('insert into storage.objects values($1,$2,$3,now(),$4)',[id,bucket,name,{size:bytes}])
  await db.exec('begin read only');const rows=(await db.query(consulta)).rows;await db.exec('commit')
  const d=clasificarFotosPercha(rows);assert.equal(d.resumen.archivos_totales,3);assert.equal(d.candidatas.length,1);assert.equal(d.resumen.bytes_percha_conocidos,4500000000);assert.equal(d.resumen.bytes_a_conservar_conocidos,34000)
  assert.equal((await db.query('select count(*)::integer n from storage.objects')).rows[0].n,4)
 })
 await test('metadatos sin tamano no inventan bytes y el inventario detecta fotos huerfanas percha',async()=>{
  await db.query('insert into storage.objects values($1,$2,$3,now(),$4)',['22222222-2222-4222-8222-000000000005','visitas-campo',ruta('percha-sin-ref.webp'),{size:'desconocido'}])
  const d=clasificarFotosPercha((await db.query(consulta)).rows);assert.equal(d.candidatas.length,2);assert.equal(d.resumen.perchas_sin_tamano,1)
 })
 await test('modificar una referencia antes de ejecutar excluye el archivo de la limpieza',async()=>{
  await db.query('insert into com_visitas_campo_sku values($1,$2)',[[ruta('percha-1.jpg')],[]])
  const d=clasificarFotosPercha((await db.query(consulta)).rows);assert.equal(d.candidatas.some(o=>o.ruta===ruta('percha-1.jpg')),false)
 })
}finally{await db.close()}
