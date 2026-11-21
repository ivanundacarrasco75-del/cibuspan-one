import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {calcularRentabilidadSku}=await server.ssrLoadModule('/src/utils/calculoRentabilidadSku.ts')
 const {distribuirCostosCompartidosSku}=await server.ssrLoadModule('/src/utils/distribucionCostosSku.ts')
 const {resumirRentabilidadTableroSku,periodosCerradosTableroSku,rangoMesTableroSku,periodoRecientePdv}=await server.ssrLoadModule('/src/utils/tableroSku.ts')
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
 await test('El aviso de ventas pendientes respeta el cliente y SKU seleccionados',()=>{
  const datos=base()
  datos.ventas.push({...datos.ventas[0],cliente_id:null,cliente_nombre:'Cliente ajeno al catálogo'})
  assert.equal(resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','c').ventasPendientes.length,0)
  assert.equal(resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20').ventasPendientes.length,1)
  assert.equal(resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','','q').ventasPendientes.length,0)
 })
 await test('Las devoluciones pendientes conservan el documento y la línea para su enlace directo',()=>{
  const datos=base(), d=datos.devoluciones[0]
  d.id='documento-1';d.documento_referencia='NC-123';d.detalles[0].id='linea-1'
  d.detalles[0].valor_total_documento=null;d.detalles[0].precio_unitario_documento=null
  const [pendiente]=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','c').devolucionesPendientes
  assert.equal(pendiente.devolucionId,'documento-1');assert.equal(pendiente.detalleId,'linea-1');assert.equal(pendiente.documento,'NC-123')
 })
 const conLibroMayor=()=>{
  const d=base()
  d.contabilidad={gastos:[{periodo:'2026-11-01',detalle_id:'t',cliente_id:'c',cuenta_codigo:'6.1.01.2.13.01',valor_asignado:20},{periodo:'2026-11-01',detalle_id:'g',cliente_id:'c',cuenta_codigo:'OTRO',valor_asignado:50}],resumen:[{periodo:'2026-11-01',gasto_especifico_cliente:70,clasificacion_pendiente:0,cuentas_pendientes:0,cuentas_sin_matriz:0}]}
  return d
 }
 await test('Los gastos históricos clasificados sustituyen facturas y distribución de nómina sin duplicarlas',()=>{
  const datos=conLibroMayor()
  datos.rentabilidad.nomina.push({periodo:'2026-11-01',area:'DISTRIBUCION',costo_empresa:200})
  const r=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','c')
  const [f]=r.financieras
  assert.equal(r.contabilidadCompleta,true);assert.equal(f.transporte,20);assert.equal(f.gastoCliente,50);assert.equal(f.manoObra,20);assert.equal(f.contribucion,-30)
 })
 await test('Una diferencia entre el gasto asignado y el balance bloquea el margen',()=>{
  const datos=conLibroMayor();datos.contabilidad.resumen[0].gasto_especifico_cliente=80
  const r=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20')
  assert.equal(r.contabilidadCompleta,false);assert.ok(r.financieras.every(f=>f.contribucion===null))
 })
 await test('El filtro conserva únicamente balances cargados y meses completos con cierre confirmado',()=>{
  const balances=['2026-08-01','2026-09-01','2026-10-01','2026-12-01'].map(periodo=>({periodo}))
  const cierres=[{periodo:'2026-08-01',mes_cerrado:true},{periodo:'2026-09-01',mes_cerrado:true},{periodo:'2026-10-01',mes_cerrado:false},{periodo:'2026-07-01',mes_cerrado:true},{periodo:'2026-12-01',mes_cerrado:true}]
  assert.deepEqual(periodosCerradosTableroSku(balances,cierres,'2026-11-20'),['2026-09-01','2026-08-01'])
 })
 await test('Los rangos mensuales incluyen el último día, también en años bisiestos',()=>{
  assert.deepEqual(rangoMesTableroSku('2024-02-01'),{desde:'2024-02-01',hasta:'2024-02-29'})
  assert.deepEqual(rangoMesTableroSku('2026-09-01'),{desde:'2026-09-01',hasta:'2026-09-30'})
  assert.deepEqual(rangoMesTableroSku('2026-13-01'),{desde:'',hasta:''})
 })
 await test('La ventana PDV incluye los 28 días hasta la última visita, aunque cruce de mes o año',()=>{
  assert.deepEqual(periodoRecientePdv('2026-11-20'),{desde:'2026-10-24',hasta:'2026-11-20'})
  assert.deepEqual(periodoRecientePdv('2026-01-10'),{desde:'2025-12-14',hasta:'2026-01-10'})
  assert.throws(()=>periodoRecientePdv('2026-02-30'))
 })
 await test('Visitas PDV de otro mes conservan su rotación sin alterar el cálculo financiero seleccionado',()=>{
  const datos=base(), anterior=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','c')
  datos.visitas=[{id:'pdv',cliente_id:'c',local_id:'l',local_nombre:'Local PDV',producto_id:'p',producto_nombre:'Pan',fecha:'2026-10-28',visitado_en:'2026-10-28T12:00:00Z',actualizado_en:'2026-10-28T12:00:00Z',lector_estado:'RESPALDO_MANUAL',valores:{rotacion:3.5}}]
  const actual=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','c')
  assert.equal(actual.rotaciones[0].rotacion,3.5);assert.equal(actual.locales[0].rotacion,3.5)
  assert.deepEqual(actual.financieras,anterior.financieras)
 })
 const conCostosCompletos=()=>{
  const d=conLibroMayor()
  Object.assign(d.contabilidad.resumen[0],{cif_total_informativo:10,gasto_general:20,depreciaciones:5})
  const r=(clasificacion_gerencial,valor,impacta_ebitda=true,incluida_costo_venta_contable=false)=>({periodo:'2026-11-01',cuenta_codigo:clasificacion_gerencial,clasificacion_gerencial,valor,impacta_ebitda,incluida_costo_venta_contable,origen:'ER'})
  d.contabilidad.rubros=[r('CIF',10),r('CIF',2,false),r('GASTO_GENERAL',20),r('GASTO_GENERAL',3,false),r('COSTO_VENTA',900,true,true)]
  return d
 }
 await test('CIF y gastos generales incluyen depreciación una vez y no duplican el costo de venta contable',()=>{
  const datos=conCostosCompletos(), r=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20')
  assert.equal(r.compartidos.controlCif.importe,12);assert.equal(r.compartidos.controlGeneral.importe,23)
  assert.equal(r.compartidos.depreciaciones,5);assert.equal(r.compartidos.conciliado,true)
  assert.equal(r.compartidos.controlCif.base,'UNIDADES');assert.equal(r.compartidos.controlGeneral.base,'VENTAS_NETAS')
  assert.equal(r.financieras.reduce((s,f)=>s+f.cif,0),12)
  assert.ok(Math.abs(r.financieras.reduce((s,f)=>s+f.generales,0)-23)<1e-9)
  assert.ok(Math.abs(r.financieras.reduce((s,f)=>s+f.resultado,0)-215)<1e-9)
 })
 await test('Los descuentos y devoluciones solo se restan en la venta neta, sin volver a cobrarlos como costos',()=>{
  const r=resumirRentabilidadTableroSku(conCostosCompletos(),'2026-11-01','2026-11-20','c')
  const f=r.financieras[0]
  assert.equal(f.netoComercial,160)
  assert.ok(Math.abs(f.resultado+f.materiales+f.manoObra+f.transporte+f.gastoCliente+f.cif+f.generales+f.descuento+f.devolucion-f.venta)<1e-9)
 })
 await test('Filtrar después del reparto conserva exactamente los CIF y generales asignados al SKU',()=>{
  const datos=conCostosCompletos()
  const todos=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20')
  const uno=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20','d','q')
  assert.deepEqual(uno.financieras,[todos.financieras.find(f=>f.id==='q')])
 })
 await test('La depreciación que ya está incluida en el CIF del costo de venta no se suma otra vez',()=>{
  const datos=conCostosCompletos()
  datos.contabilidad.rubros[1].incluida_costo_venta_contable=true
  datos.contabilidad.resumen[0].cif_total_informativo=12
  const r=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20')
  assert.equal(r.compartidos.controlCif.importe,12);assert.equal(r.compartidos.conciliado,true)
 })
 await test('Falta de rubros o diferencia con el balance deja el resultado completo pendiente',()=>{
  const datos=conCostosCompletos();datos.contabilidad.rubros=null
  let r=resumirRentabilidadTableroSku(datos,'2026-11-01','2026-11-20')
  assert.ok(r.financieras.every(f=>f.resultado===null));assert.equal(r.financieras.find(f=>f.id==='q').contribucion,280)
  const otro=conCostosCompletos();otro.contabilidad.resumen[0].gasto_general=99
  r=resumirRentabilidadTableroSku(otro,'2026-11-01','2026-11-20')
  assert.equal(r.compartidos.conciliado,false);assert.ok(r.financieras.every(f=>f.resultado===null))
 })
 await test('El reparto estimado por unidades incluye SKU históricos sin inventarles equivalencia de kilos',()=>{
  const datos=conCostosCompletos(), input={...datos,...datos.rentabilidad,relaciones:datos.asignaciones,desde:'2026-11-01',hasta:'2026-11-20'}
  const {filas}=calcularRentabilidadSku(input);filas.find(f=>f.codigo==='EAN').kgEquivalente=0
  const args={movimientos:filas,rubros:datos.contabilidad.rubros,resumen:datos.contabilidad.resumen,reglas:[],periodo:'2026-11-01'}
  assert.equal(distribuirCostosCompartidosSku(args).controlCif.pendiente,true)
  const aprobado=distribuirCostosCompartidosSku({...args,baseCif:'UNIDADES'})
  assert.equal(aprobado.controlCif.pendiente,false);assert.equal(aprobado.cif.get(filas[0].key),6)
 })
} finally {await server.close()}
