import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { prepararAltaInventario, unidadAltaInventario } from '../src/utils/altaArticuloInventario.ts'
import { vincularArticulo } from '../src/utils/inventarioInicialExcel.ts'

const datos={clase:'MATERIA_PRIMA',codigo:'123',nombre:'Zanahoria deshidratada',unidad:'UNIDAD',vidaUtilDias:0,loteProduccion:0,reactivar:false}
function servicio(tablas={},fallo=null) {
  const registros={materias_primas:[],productos:[],...structuredClone(tablas)}
  const escrituras=[]
  const supabase={from(tabla) {
    let operacion='leer',payload,filtro,inicio=0,fin=499
    const consulta={select(){return consulta},order(){return consulta},range(a,b){inicio=a;fin=b;return consulta},
      eq(campo,valor){filtro={campo,valor};return consulta},update(valor){operacion='actualizar';payload=valor;return consulta},
      insert(valor){operacion='crear';payload=valor;return consulta},single(){return consulta},
      then(resolve,reject){
        let respuesta
        if(fallo) respuesta={data:null,error:fallo}
        else if(operacion==='leer') respuesta={data:registros[tabla].slice(inicio,fin+1),error:null}
        else if(operacion==='crear') {
          const nuevo={id:'creado',...payload};registros[tabla].push(nuevo);escrituras.push({tabla,operacion,payload});respuesta={data:nuevo,error:null}
        } else {
          const registro=registros[tabla].find(r=>r[filtro.campo]===filtro.valor)
          if(registro) Object.assign(registro,payload)
          escrituras.push({tabla,operacion,payload});respuesta={data:registro??null,error:null}
        }
        return Promise.resolve(respuesta).then(resolve,reject)
      }}
    return consulta
  }}
  const module={exports:{}}
  const source=fs.readFileSync(new URL('../src/repositories/altaArticuloInventarioRepository.ts',import.meta.url),'utf8')
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    module,exports:module.exports,Error,Number,String,Promise,
    require(name){
      if(name.includes('lib/supabase')) return {supabase}
      if(name.includes('altaArticuloInventario')) return {prepararAltaInventario}
      if(name.includes('inventarioInicialExcel')) return {vincularArticulo}
      if(name.includes('catalogoService')) return {crearProductoDb:async(d)=>{
        escrituras.push({tabla:'productos',operacion:'crear',payload:d});return {id:'pt-creado'}
      }}
      throw new Error(name)
    }
  })
  return {...module.exports,registros,escrituras}
}

test('MP y empaques se crean con código contable normalizado, sin registrar stock ni costo ficticio',async()=>{
  const s=servicio()
  const nuevo=await s.guardarAltaArticuloInventario(datos)
  assert.equal(nuevo.id,'creado');assert.equal(nuevo.tipo,'MATERIA_PRIMA')
  const p=s.escrituras[0].payload
  assert.equal(p.codigo,'00123');assert.equal(p.codigo_contable,'00123');assert.equal(p.unidad_base,'UNIDAD')
  assert.equal(p.nombre,'ZANAHORIA DESHIDRATADA');assert.equal(p.es_empaque,false)
  assert.equal('stock' in p,false);assert.equal('costo_total' in p,false)
  assert.equal(prepararAltaInventario({...datos,clase:'EMPAQUE'}).esEmpaque,true)
  assert.equal(prepararAltaInventario({...datos,clase:'MICRO',unidad:'KILOS'}).incluirEnCosteo,false)
  assert.equal(unidadAltaInventario('KILOGRAMOS'),'KG');assert.equal(unidadAltaInventario('GRAMOS'),'')
})
test('Producto terminado pide vida útil y unidades por parada reales antes de crearlo',async()=>{
  const s=servicio()
  await assert.rejects(s.guardarAltaArticuloInventario({...datos,clase:'PRODUCTO_TERMINADO'}),/vida útil/)
  await assert.rejects(s.guardarAltaArticuloInventario({...datos,clase:'PRODUCTO_TERMINADO',vidaUtilDias:30}),/parada/)
  const nuevo=await s.guardarAltaArticuloInventario({...datos,clase:'PRODUCTO_TERMINADO',codigo:'7868304262219T',vidaUtilDias:21,loteProduccion:100})
  assert.equal(nuevo.id,'pt-creado');assert.equal(s.escrituras.length,1)
  assert.equal(s.escrituras[0].payload.vidaUtilDias,21);assert.equal(s.escrituras[0].payload.codigo,'7868304262219T')
  assert.throws(()=>prepararAltaInventario({...datos,clase:''}),/tipo/)
  assert.throws(()=>prepararAltaInventario({...datos,codigo:''}),/código/)
})
test('Un artículo existente se reutiliza, incluidos los ceros iniciales y códigos contables',async()=>{
  const s=servicio({materias_primas:[{id:'original',codigo:'ZANAHORIA',codigo_contable:'00123',nombre:'Zanahoria',unidad_base:'UNIDAD',activo:true}]})
  assert.equal((await s.guardarAltaArticuloInventario(datos)).id,'original')
  assert.equal(s.escrituras.length,0)
})
test('Los inactivos se reactivan solo con confirmación explícita, conservando sus datos',async()=>{
  const original={id:'original',codigo:'00123',codigo_contable:'00123',nombre:'Nombre original',unidad_base:'UNIDAD',activo:false}
  const s=servicio({materias_primas:[original]})
  await assert.rejects(s.guardarAltaArticuloInventario(datos),/inactivo/)
  assert.equal(s.escrituras.length,0)
  assert.equal((await s.guardarAltaArticuloInventario({...datos,reactivar:true})).id,'original')
  assert.equal(s.registros.materias_primas.length,1);assert.equal(s.registros.materias_primas[0].nombre,original.nombre)
  assert.deepEqual(Object.keys(s.escrituras[0].payload),['activo'])
})
test('Códigos ambiguos y errores de permisos no crean ni anuncian artículos guardados',async()=>{
  const s=servicio({materias_primas:[{id:'a',codigo:'00123',nombre:'A',activo:true}],productos:[{id:'b',codigo:'123',nombre:'B',activo:true}]})
  await assert.rejects(s.guardarAltaArticuloInventario(datos),/varios/)
  assert.equal(s.escrituras.length,0)
  const denegado=servicio({}, {message:'No tienes permiso para modificar este módulo.'})
  await assert.rejects(denegado.guardarAltaArticuloInventario(datos),/permiso/)
  assert.equal(denegado.escrituras.length,0)
})
test('La búsqueda revisa todas las páginas del catálogo antes de crear',async()=>{
  const filas=Array.from({length:501},(_,i)=>({id:String(i),codigo:'COD-'+i,nombre:'Item '+i,unidad_base:'KG',activo:true}))
  filas[500].codigo='00123'
  const s=servicio({materias_primas:filas})
  assert.equal((await s.guardarAltaArticuloInventario(datos)).id,'500')
  assert.equal(s.escrituras.length,0)
})
