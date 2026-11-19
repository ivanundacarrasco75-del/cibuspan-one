import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
after(()=>server.close())
const {validarPedidoCM,esCodigoCM,fechaLocalCM}=await server.ssrLoadModule('/src/utils/casaMasa.ts')
const {puedeAbrirPantalla}=await server.ssrLoadModule('/src/utils/permisosAplicacion.ts')
test('Sólo SKU CM y cantidades válidas, sin repetir códigos',()=>{
 assert.equal(esCodigoCM(' cm-001 '),true);assert.equal(esCodigoCM('CM-005'),false)
 validarPedidoCM([{codigo:'CM-001',cantidad:20,manejo:1},{codigo:'CM-002',cantidad:6,manejo:3}])
 for(const p of [[],[{codigo:'OTRO',cantidad:1,manejo:1}],[{codigo:'CM-001',cantidad:1.5,manejo:1}],[{codigo:'CM-001',cantidad:0,manejo:1}],[{codigo:'CM-001',cantidad:5,manejo:3}],[{codigo:'CM-001',cantidad:2,manejo:1},{codigo:'cm-001',cantidad:1,manejo:1}]]) assert.throws(()=>validarPedidoCM(p))
 assert.match(fechaLocalCM(),/^\d{4}-\d{2}-\d{2}$/)
})
test('Casa Masa exige permiso propio y acceso operativo; no amplía accesos existentes',()=>{
 const ruta='Casa Masa · Pedidos y empaque'
 assert.equal(puedeAbrirPantalla(ruta,'BODEGUERO',['Casa Masa','Despachos']),true)
 assert.equal(puedeAbrirPantalla(ruta,'GERENTE',['Casa Masa','Pedidos']),true)
 for(const permisos of [[],['Casa Masa'],['Pedidos'],['Despachos']]) assert.equal(puedeAbrirPantalla(ruta,'ADMINISTRADOR',permisos),false)
 assert.equal(puedeAbrirPantalla('Comercial · Pedidos','BODEGUERO',['Casa Masa','Despachos']),false)
})
