import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.CIBUSPAN_SQL_TEST_MODULE||'@electric-sql/pglite')
const sql=await readFile(new URL('../supabase/diagnosticos/auditoria_flujo_operativo.sql',import.meta.url),'utf8')
test('Diagnóstico opera en transacción de sólo lectura y exporta esquema sin filas de negocio',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role authenticated; create table pedidos(id int primary key,numero_pedido_cliente text unique);
    insert into pedidos values(1,'DATO-PRIVADO-QUE-NO-DEBE-EXPORTARSE');
    alter table pedidos enable row level security;
    create policy lectura_pedidos on pedidos for select to authenticated using(true);
    create function registrar_produccion_completa() returns text language sql as $$select 'funcion de prueba'::text$$;
    create table reservas_inventario(id int primary key);
    create function activar_control_conciliacion_despacho() returns boolean language sql as $$select true$$;
    create function vincular_factura_despacho() returns text language sql as $$select 'factura de prueba'::text$$;
    create function test_trigger_auditoria() returns trigger language plpgsql as $$begin return new;end$$;
    create trigger test_auditoria before insert on pedidos for each row execute function test_trigger_auditoria();
    create view stock_disponible_lotes as select id from pedidos;`)
  await db.exec('begin read only')
  const resultado=(await db.query(sql)).rows[0].auditoria_flujo_operativo
  assert.equal(resultado.tipo,'auditoria_flujo_operativo')
  assert.ok(resultado.funciones.some(f=>f.nombre==='registrar_produccion_completa'&&f.definicion.includes('CREATE OR REPLACE FUNCTION')))
  assert.ok(resultado.funciones.some(f=>f.nombre==='test_trigger_auditoria'))
  assert.ok(resultado.funciones.some(f=>f.nombre==='activar_control_conciliacion_despacho'))
  assert.ok(resultado.funciones.some(f=>f.nombre==='vincular_factura_despacho'))
  assert.ok(resultado.objetos.some(o=>o.nombre==='reservas_inventario'))
  assert.ok(resultado.funciones_no_encontradas.includes('obtener_produccion_sugerida'))
  const tabla=resultado.objetos.find(o=>o.nombre==='pedidos')
  assert.equal(tabla.rls_activo,true);assert.equal(tabla.triggers[0].nombre,'test_auditoria')
  assert.ok(tabla.restricciones.some(c=>c.tipo==='u'));assert.ok(resultado.politicas.some(p=>p.nombre==='lectura_pedidos'))
  assert.ok(resultado.objetos.find(o=>o.nombre==='stock_disponible_lotes').vista.includes('pedidos'))
  assert.equal(JSON.stringify(resultado).includes('DATO-PRIVADO-QUE-NO-DEBE-EXPORTARSE'),false)
  await db.exec('rollback')
  assert.equal((await db.query('select count(*)::int n from pedidos')).rows[0].n,1)
 }finally{await db.close()}
})
