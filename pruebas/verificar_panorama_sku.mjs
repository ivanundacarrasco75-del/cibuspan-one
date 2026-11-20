import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {calcularRentabilidadSku}=await server.ssrLoadModule('/src/utils/calculoRentabilidadSku.ts')
 const {resumirRentabilidadTableroSku}=await server.ssrLoadModule('/src/utils/tableroSku.ts')
 const base=()=>({
  productos:[{id:'p',codigo:'EAN',nombre:'Pan',corto:'Pan'},{id:'q',codigo:'OTRO',nombre:'Otro',corto:'Otro'}],
  clientes:[{id:'c',nombre:'Cadena'},{id:'d',nombre:'Otra cadena'}],
  asignaciones:[{cliente_id:'c',producto_id:'p',precio:2},{cliente_id:'d',producto_id:'q',precio:4}],
  ventas:[{fecha_emision:'2026-11-10',cliente_id:'c',cliente_nombre:'Cadena',producto_id:'p',sku:'EAN',cantidad:100,total_sin_impuestos:200},
   {fecha_emision:'2026-11-10',cliente_id:'d',cliente_nombre:'Otra cadena',producto_id:'q',sku:'OTRO',cantidad:100,total_sin_impuestos:400}],
  devoluciones:[{fecha_devolucion:'2026-11-15',cliente:{id:'c',nombre:'Cadena'},detalles:[{producto_id:'p',unidades:10,valor_total_documento:20,precio_unitario_documento:2,vida_efectiva_dias:30,semana_origen_inicio:'2026-10-12'}]}],
  costos:['p','q'].map((id,i)=>({producto_id:id,producto_codigo:i?'OTRO':'EAN',costo_materiales_unidad:1,items_sin_costo:0,batch_calculado_kg:50,rendimiento_unidades:100})),
  visitas:[],errores:[],rentabilidad:{
   promociones:[{activo:true,cliente_id:'c',fecha_inicio:'2026-11-01',fecha_fin:'2026-11-30',productos:[{producto_id:'p',sku:'EAN',tipo_descuento:'PORCENTAJE',valor_descuento:10}]}],
   nomina:[{periodo:'2026-11-01',area:'MANO_OBRA_DIRECTA',costo_empresa:40}],reglas:[],
   facturas:[{periodo_servicio:'2026-11-01',estado:'REGISTRADA',impacta_ebitda:true,cuenta_codigo:'6.1.01.2.13.01',subtotal:20,afecta_tipo:'GENERAL'},
    {periodo_servicio:'2026-11-01',estado:'REGISTRADA',impacta_ebitda:true,cuenta_codigo:'OTRO',subtotal:30,afecta_tipo:'CLIENTE',cliente_id:'c'}],
  },
 })
 await test('Integra descuentos, devoluciones, materiales, nómina, transporte y gasto del cliente sin duplicarlos',()=>{
  const r=resumirRentabilidadTableroSku(base(),'2026-11-01','2026-11-20')
  const f=r.financieras.find(f=>f.id==='p')
  assert.equal(f.netoComercial,160);assert.equal(f.materiales,100);assert.equal(f.manoObra,20)
  assert.equal(f.transporte,10);assert.equal(f.gastoCliente,30);assert.equal(f.contribucion,0)
  assert.equal(r.financieras.find(f=>f.id==='q').contribucion,270)
 })
 await test('Filtrar cliente o SKU conserva su costo asignado sobre la base completa',()=>{
  const datos=base(), total=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20')
  const filtro=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','d','q')
  assert.deepEqual(filtro.financieras,[total.financieras.find(f=>f.id==='q')])
 })
 await test('Una fuente de costos fallida no se convierte en utilidad ni margen cero',()=>{
  const datos=base();datos.rentabilidad.facturas=null
  const f=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20').financieras.find(f=>f.id==='p')
  assert.equal(f.contribucion,null);assert.equal(f.margen,null);assert.equal(f.netoComercial,160)
 })
 await test('Devoluciones sin valor y materiales incompletos dejan el aporte pendiente',()=>{
  const datos=base();datos.costos[0].items_sin_costo=1
  assert.equal(resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20').financieras.find(f=>f.id==='p').contribucion,null)
  datos.devoluciones[0].detalles[0].valor_total_documento=null;datos.devoluciones[0].detalles[0].precio_unitario_documento=null
  assert.equal(resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20').financieras.find(f=>f.id==='p').netoComercial,null)
 })
 await test('El reporte conserva la atribución por origen y el tablero usa fecha de registro explícita',()=>{
  const datos=base(), input={...datos,...datos.rentabilidad,relaciones:datos.asignaciones,desde:'2026-11-01',hasta:'2026-11-20'}
  const reporte=calcularRentabilidadSku(input)
  const tablero=calcularRentabilidadSku({...input,baseDevoluciones:'REGISTRO'})
  assert.equal(reporte.filas.find(f=>f.codigo==='EAN').devoluciones,0)
  assert.equal(tablero.filas.find(f=>f.codigo==='EAN').devoluciones,20)
 })
 await test('El margen ponderado se obtiene de aporte total dividido entre venta neta total',()=>{
  const {financieras}=resumirRentabilidadTableroSku(base(),'2026-11-01','2026-11-20')
  const margen=financieras.reduce((s,f)=>s+f.contribucion,0)/financieras.reduce((s,f)=>s+f.netoComercial,0)*100
  assert.ok(Math.abs(margen-48.214285714285715)<1e-9)
  assert.notEqual(margen,financieras.reduce((s,f)=>s+f.margen,0)/financieras.length)
 })
} finally {await server.close()}
