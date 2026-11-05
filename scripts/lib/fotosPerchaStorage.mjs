import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const PERCHA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{4}-\d{2}-\d{2}\/percha-[a-z0-9.-]+\.(png|jpe?g|webp)$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function clasificarFotosPercha(entrada) {
  const filas=typeof entrada==='string'?JSON.parse(entrada):entrada
  if(!Array.isArray(filas)||filas.length!==1)throw Error('El diagnostico debe devolver exactamente una fila.')
  let d=filas[0].diagnostico_fotos_percha
  if(typeof d==='string')d=JSON.parse(d)
  if(!d||d.tipo!=='diagnostico_fotos_percha'||d.version!==1||!Array.isArray(d.capturas_protegidas)||!Array.isArray(d.objetos))throw Error('Diagnostico incompleto: no se autoriza limpieza.')
  if(d.capturas_protegidas.some(r=>typeof r!=='string'||!r))throw Error('Lista de capturas invalida.')
  const protegidas=new Set(d.capturas_protegidas),ids=new Set(),rutas=new Set()
  const candidatas=[],conservar=[]
  for(const o of d.objetos){
    if(!o||!UUID.test(o.id)||o.bucket_id!=='visitas-campo'||typeof o.ruta!=='string'||!o.ruta||ids.has(o.id)||rutas.has(o.ruta)||typeof o.actualizado_en!=='string'||!o.actualizado_en)throw Error('Objeto ambiguo o de otro deposito: no se autoriza limpieza.')
    if(o.bytes!==null&&(!Number.isSafeInteger(o.bytes)||o.bytes<0))throw Error('Tamano de archivo invalido.')
    ids.add(o.id);rutas.add(o.ruta)
    if(PERCHA.test(o.ruta)&&!protegidas.has(o.ruta))candidatas.push({...o,uri:`ss:///visitas-campo/${o.ruta}`})
    else conservar.push(o)
  }
  candidatas.sort((a,b)=>a.ruta.localeCompare(b.ruta,'en'))
  return {
    tipo:d.tipo,version:d.version,generado_en:d.generado_en,
    hash_capturas:createHash('sha256').update(JSON.stringify([...protegidas].sort())).digest('hex'),
    objetos:d.objetos,
    candidatas,
    resumen:{archivos_totales:d.objetos.length,fotos_percha_eliminables:candidatas.length,
      bytes_bucket_conocidos:d.objetos.reduce((s,o)=>s+(o.bytes??0),0),
      bytes_a_conservar_conocidos:conservar.reduce((s,o)=>s+(o.bytes??0),0),
      bytes_percha_conocidos:candidatas.reduce((s,o)=>s+(o.bytes??0),0),perchas_sin_tamano:candidatas.filter(o=>o.bytes===null).length,
      capturas_referenciadas:protegidas.size,archivos_captura_presentes:d.objetos.filter(o=>protegidas.has(o.ruta)).length,
      archivos_conservados:conservar.length}
  }
}
export function loteSinCambios(plan,actual) {
  if(plan.hash_capturas!==actual.hash_capturas)throw Error('Cambio la lista de capturas protegidas. Vuelve a revisar sin -Eliminar.')
  const porId=new Map(actual.candidatas.map(o=>[o.id,o]))
  return plan.candidatas.filter(o=>{
    const vigente=porId.get(o.id)
    if(!vigente)return false
    if(vigente.ruta!==o.ruta||vigente.actualizado_en!==o.actualizado_en||vigente.bytes!==o.bytes)throw Error('Una foto cambio despues del diagnostico. No continuar.')
    return true
  })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const modo=process.argv[2]
    if(modo==='clasificar')process.stdout.write(JSON.stringify(clasificarFotosPercha(readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''))))
    else if(modo==='lote'){
      const cargar=p=>clasificarFotosPercha(readFileSync(p,'utf8').replace(/^\uFEFF/,''))
      process.stdout.write(JSON.stringify(loteSinCambios(cargar(process.argv[3]),cargar(process.argv[4])).slice(0,25)))
    }else throw Error('Modo no valido.')
  }catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
