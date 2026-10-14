import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.CIBUSPAN_SQL_TEST_MODULE || '@electric-sql/pglite')
const archivo=(nombre)=>readFile(new URL(`../supabase/migrations/${nombre}`,import.meta.url),'utf8')
const autor='00000000-0000-0000-0000-000000000001', otro='00000000-0000-0000-0000-000000000002'
const cliente='00000000-0000-0000-0000-000000000003', local='00000000-0000-0000-0000-000000000004'
const producto='00000000-0000-0000-0000-000000000005', visita='00000000-0000-0000-0000-000000000006', detalle='00000000-0000-0000-0000-000000000007'

test('Recuperación de cantidades sobre tablas reales de campo, sin duplicar ni alterar evidencia',async(t)=>{
 const db=new PGlite()
 try{
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create table public.app_profiles(user_id uuid primary key,rol text,activo boolean default true);
    create table public.clientes(id uuid primary key); create table public.productos(id uuid primary key,codigo text default '7868304262189');
    create table public.com_locales_monitoreados(id uuid primary key,nombre text default 'SUPERMAXI AMERICA',cliente_id uuid default '00000000-0000-0000-0000-000000000003');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.app_puede(text,uuid) returns boolean language sql as $$select coalesce(current_setting('prueba.permiso',true),'si') <> 'no'$$;
    create function public.com_puede_ver_cliente_campo(uuid,uuid,date) returns boolean language sql as $$select coalesce(current_setting('prueba.acceso',true),'si') <> 'no'$$;
    create function public.app_es_admin() returns boolean language sql as $$select exists(select 1 from public.app_profiles where user_id=auth.uid() and rol='ADMINISTRADOR' and activo)$$;
    create function public.com_es_gerencia_kpi() returns boolean language sql as $$select exists(select 1 from public.app_profiles where user_id=auth.uid() and rol in ('ADMINISTRADOR','GERENTE') and activo)$$;
  `)
  const base=await archivo('202609220001_kpi_kam_campo_rotacion.sql')
  for(const tabla of ['com_visitas_campo','com_visitas_campo_sku']) await db.exec(base.match(new RegExp(`create table if not exists public.${tabla} \\([\\s\\S]*?\\n\\);`))[0])
  await db.exec(`insert into auth.users values('${autor}'),('${otro}'); insert into app_profiles values('${autor}','MERCADERISTA',true),('${otro}','KAM',true);
    insert into clientes values('${cliente}'); insert into productos(id) values('${producto}'); insert into com_locales_monitoreados(id) values('${local}');
    insert into com_visitas_campo(id,cliente_id,local_monitoreado_id,fecha_visita,registrado_por) values('${visita}','${cliente}','${local}','2026-10-12','${autor}');
    insert into com_visitas_campo_sku(id,visita_id,producto_id,stock_local_unidades,capturas_app,fotos_percha,datos_ia) values('${detalle}','${visita}','${producto}',7,array['original.png'],array['percha.png'],'{"caras_percha":6,"responsable_id":"${autor}","georreferencia_visita":{"estado":"COMPATIBLE"}}');
  `)
  await db.exec(await archivo('202610120001_completar_lecturas_campo.sql'))
  await db.exec(await archivo('202610120002_revisar_lecturas_campo.sql'))
  const sesion=(id)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  const actual=async()=> (await db.query('select *, actualizado_en::text as token from com_visitas_campo_sku')).rows[0]
  const aplicar=(datos,token)=>db.query('select public.com_kpi_campo_completar_lectura($1::uuid,$2::timestamptz,$3::jsonb) as respuesta',[detalle,token,JSON.stringify(datos)])
  await sesion(autor)
  await t.test('Completa rotación/precio y conserva identidad, stock manual, caras y fotos',async()=>{
    const antes=await actual()
    await aplicar({rotacion_diaria_unidades:2.5,precio_comercio:1.6,confianza:.9,advertencias:[],texto_ocr:'captura'},antes.token)
    const despues=await actual()
    assert.equal(Number(despues.stock_local_unidades),7);assert.equal(Number(despues.rotacion_diaria_unidades),2.5)
    assert.equal(despues.datos_ia.caras_percha,6);assert.deepEqual(despues.datos_ia.georreferencia_visita,{estado:'COMPATIBLE'})
    assert.equal(despues.visita_id,visita);assert.equal(despues.producto_id,producto);assert.deepEqual(despues.capturas_app,antes.capturas_app);assert.deepEqual(despues.fotos_percha,antes.fotos_percha)
    assert.equal(despues.datos_ia.rotacion_diaria_unidades,2.5);assert.equal(despues.datos_ia.responsable_id,autor)
  })
  await t.test('Reintento no duplica visitas ni SKU; una revisión desactualizada no sobreescribe',async()=>{
    const antes=await actual();await aplicar({rotacion_diaria_unidades:2.5},antes.token)
    await assert.rejects(()=>aplicar({rotacion_diaria_unidades:9},antes.token),/cambió/)
    assert.equal((await db.query('select count(*)::int as n from com_visitas_campo')).rows[0].n,1)
    assert.equal((await db.query('select count(*)::int as n from com_visitas_campo_sku')).rows[0].n,1)
    assert.equal(Number((await actual()).rotacion_diaria_unidades),2.5)
  })
  await t.test('Otra persona con acceso al cliente no puede modificar la visita original',async()=>{
    await sesion(otro);const antes=await actual()
    await assert.rejects(()=>aplicar({stock_local_unidades:99},antes.token),/autor o un administrador/)
    assert.equal(Number((await actual()).stock_local_unidades),7);await sesion(autor)
  })
  await t.test('Bloquea falta de permiso y falta de acceso al cliente',async()=>{
    const token=(await actual()).token
    await db.query("select set_config('prueba.permiso','no',false)")
    await assert.rejects(()=>aplicar({rotacion_diaria_unidades:9},token),/permiso/)
    await db.query("select set_config('prueba.permiso','si',false),set_config('prueba.acceso','no',false)")
    await assert.rejects(()=>aplicar({rotacion_diaria_unidades:9},token),/autor o un administrador/)
    await db.query("select set_config('prueba.acceso','si',false)")
  })
  await t.test('Rechaza campos ajenos, valores inválidos y actualización sin cantidades',async()=>{
    const antes=await actual()
    for(const datos of [{caras_percha:0,rotacion_diaria_unidades:1},{rotacion_diaria_unidades:-1},{rotacion_diaria_unidades:'NaN'},{stock_local_unidades:null},{texto_ocr:'texto'}]) await assert.rejects(()=>aplicar(datos,antes.token))
    assert.equal((await actual()).token,antes.token);assert.equal((await actual()).datos_ia.caras_percha,6)
  })
  await t.test('Cero explícito se guarda y un campo nulo no borra el valor anterior',async()=>{
    const antes=await actual();await aplicar({stock_local_unidades:0,precio_comercio:null},antes.token)
    assert.equal(Number((await actual()).stock_local_unidades),0);assert.equal(Number((await actual()).precio_comercio),1.6)
  })
  await t.test('Gerencia autorizada completa datos sin convertirse en autor original',async()=>{
    for(const rol of ['ADMINISTRADOR','GERENTE']){
      await db.query("update app_profiles set rol=$1 where user_id=$2",[rol,otro]);await sesion(otro)
      await aplicar({venta_diaria_valor:4},(await actual()).token)
    }
    assert.equal(Number((await actual()).venta_diaria_valor),4)
    assert.equal((await actual()).datos_ia.responsable_id,autor)
    assert.equal((await db.query('select registrado_por from com_visitas_campo')).rows[0].registrado_por,autor)
    await sesion(autor)
  })
  await t.test('Sesión anónima y visita anulada no pueden completar lecturas',async()=>{
    const token=(await actual()).token;await sesion('')
    await assert.rejects(()=>aplicar({venta_diaria_valor:99},token),/permiso/)
    await sesion(autor);await db.exec("update com_visitas_campo set estado='ANULADA'")
    await assert.rejects(()=>aplicar({venta_diaria_valor:99},token),/autor o un administrador/)
    assert.equal(Number((await actual()).venta_diaria_valor),4)
  })
  await db.exec("update com_visitas_campo set estado='CONFIRMADA'")
  await t.test('Guarda fechas completas y permite revisión sin cambiar cantidades',async()=>{
    await aplicar({fecha_ultimo_pedido:'2026-10-10',fecha_ultimo_despacho:'2026-10-11'},(await actual()).token)
    const r=await actual();assert.equal(r.fecha_ultimo_pedido.toISOString().slice(0,10),'2026-10-10');assert.equal(r.fecha_ultimo_despacho.toISOString().slice(0,10),'2026-10-11')
    assert.equal(r.datos_ia.fecha_ultimo_pedido,'2026-10-10');assert.equal(r.datos_ia.caras_percha,6)
    assert.equal((await db.query('select fecha_visita::text as fecha from com_visitas_campo')).rows[0].fecha,'2026-10-12')
  })
  await t.test('Corrige el año mal guardado como cantidad únicamente al quitarlo expresamente',async()=>{
    await aplicar({cantidad_ultimo_pedido:2026},(await actual()).token)
    const antes=await actual()
    await aplicar({campos_borrar:['cantidad_ultimo_pedido','fecha_ultimo_pedido']},antes.token)
    const r=await actual();assert.equal(r.cantidad_ultimo_pedido,null);assert.equal(r.fecha_ultimo_pedido,null);assert.equal(r.datos_ia.cantidad_ultimo_pedido,null)
    assert.equal(Number(r.stock_local_unidades),0);assert.deepEqual(r.capturas_app,['original.png']);assert.equal(r.datos_ia.caras_percha,6)
    await assert.rejects(()=>aplicar({campos_borrar:['stock_local_unidades']},antes.token),/cambió/)
  })
  await t.test('Fechas inválidas, borrados ajenos y valor/borrado simultáneo no alteran el detalle',async()=>{
    const antes=await actual()
    for(const datos of [{fecha_ultimo_pedido:2026},{fecha_ultimo_pedido:'2026'},{fecha_ultimo_pedido:'2026-02-30'},{campos_borrar:['fecha_visita']},{campos_borrar:['caras_percha']},{campos_borrar:'cantidad_ultimo_pedido'},{stock_local_unidades:9,campos_borrar:['stock_local_unidades']}])await assert.rejects(()=>aplicar(datos,antes.token))
    assert.equal((await actual()).token,antes.token)
    assert.equal((await db.query('select count(*)::int as n from com_visitas_campo_sku')).rows[0].n,1)
  })
  await db.exec(await archivo('202610130001_auditar_lecturas_campo.sql'))
  await db.exec(await archivo('202610130002_coincidencia_local_capturas.sql'))
  await db.exec(await archivo('202610130003_validacion_pedidos_capturas.sql'))
  const auditar=(datos,token)=>db.query('select public.com_kpi_campo_auditar_lectura($1::uuid,$2::timestamptz,$3::jsonb)',[detalle,token,JSON.stringify(datos)])
  const evidencia=(valor)=>({codigo_barras:'7868304262189',local_nombre:'SUPERMAXI AMERICA',fecha_fuente:'2026-10-12T14:00:00',confianza:.9,rotacion_diaria_unidades:valor,campos_sin_dato:['cantidad_ultimo_pedido']})
  const datosAuditados=(valor)=>({rotacion_diaria_unidades:valor,version_validacion:'20261013.2',verificacion_campos:{rotacion_diaria_unidades:{estado:'DOBLE_LECTURA',valor}},lectura_control:{principal:evidencia(valor),control:evidencia(valor)}})
  await t.test('Audita y corrige 115 a 1.13, conservando el respaldo transaccional y sin duplicados',async()=>{
    await aplicar({rotacion_diaria_unidades:115},(await actual()).token)
    const antes=await actual();await auditar(datosAuditados(1.13),antes.token)
    assert.equal(Number((await actual()).rotacion_diaria_unidades),1.13)
    const historial=(await db.query('select * from com_lecturas_campo_auditoria')).rows
    assert.equal(historial.length,1);assert.equal(historial[0].anterior.rotacion_diaria_unidades,115);assert.equal(historial[0].posterior.rotacion_diaria_unidades,1.13)
    assert.deepEqual(historial[0].anterior.capturas_app,historial[0].posterior.capturas_app)
    assert.equal((await db.query('select count(*)::int as n from com_visitas_campo_sku')).rows[0].n,1)
  })
  await t.test('Valida metadatos sin modificar cantidades; el token anterior impide repetir el guardado',async()=>{
    const antes=await actual(), d=datosAuditados(1.13);delete d.rotacion_diaria_unidades
    await auditar(d,antes.token);assert.equal(Number((await actual()).rotacion_diaria_unidades),1.13)
    await assert.rejects(async()=>auditar(d,antes.token),/cambió/)
  })
  await t.test('Evidencia incorrecta o etiqueta distinta del valor guardado revierte cambios y respaldo',async()=>{
    const antes=await actual(), n=(await db.query('select count(*)::int as n from com_lecturas_campo_auditoria')).rows[0].n
    for(const cambiar of [d=>{d.lectura_control.control.rotacion_diaria_unidades=115},d=>{d.verificacion_campos.rotacion_diaria_unidades.valor=115},d=>{d.lectura_control.principal.codigo_barras='7868304262196'},d=>{d.lectura_control.principal.local_nombre='SUPERMAXI OTRO'},d=>{d.lectura_control.principal.fecha_fuente='2026-10-01T14:00:00'}]){
      const d=datosAuditados(2);cambiar(d);await assert.rejects(async()=>auditar(d,antes.token))
    }
    assert.equal((await actual()).token,antes.token);assert.equal(Number((await actual()).rotacion_diaria_unidades),1.13)
    assert.equal((await db.query('select count(*)::int as n from com_lecturas_campo_auditoria')).rows[0].n,n)
  })
  await t.test('Cantidad automática sin fecha se rechaza; una cantidad con fecha en ambas lecturas sí se guarda',async()=>{
    const antes=await actual(), valor=5
    const d={cantidad_ultimo_pedido:valor,version_validacion:'20261013.2',verificacion_campos:{cantidad_ultimo_pedido:{estado:'DOBLE_LECTURA',valor}},lectura_control:{principal:{...evidencia(1.13),cantidad_ultimo_pedido:valor,fecha_ultimo_pedido:null},control:{...evidencia(1.13),cantidad_ultimo_pedido:valor,fecha_ultimo_pedido:null}}}
    await assert.rejects(()=>auditar(d,antes.token),/fecha asociada/)
    assert.equal((await actual()).token,antes.token)
    d.fecha_ultimo_pedido='2026-10-10';d.verificacion_campos.fecha_ultimo_pedido={estado:'DOBLE_LECTURA',valor:'2026-10-10'}
    d.lectura_control.principal.fecha_ultimo_pedido='2026-10-10';d.lectura_control.control.fecha_ultimo_pedido='2026-10-10'
    await auditar(d,antes.token);assert.equal(Number((await actual()).cantidad_ultimo_pedido),5)
    assert.equal((await actual()).datos_ia.verificacion_campos.cantidad_ultimo_pedido.estado,'DOBLE_LECTURA')
  })
  await t.test('Dejar un dato anterior dudoso como pendiente no lo borra ni altera las otras cantidades',async()=>{
    const antes=await actual()
    await auditar({version_validacion:'20261013.2',verificacion_campos:{cantidad_ultimo_pedido:{estado:'PENDIENTE',valor:5,motivo:'Sin fecha confirmada en la nueva fuente'}}},antes.token)
    assert.equal(Number((await actual()).cantidad_ultimo_pedido),5)
    assert.equal((await actual()).datos_ia.verificacion_campos.cantidad_ultimo_pedido.estado,'PENDIENTE')
  })
  await t.test('Un cliente con protocolo antiguo no puede certificar lecturas automáticas',async()=>{
    const antes=await actual();await assert.rejects(()=>auditar({...datosAuditados(1.13),version_validacion:'20261013.1'},antes.token),/verificación válida/)
    assert.equal((await actual()).token,antes.token)
  })
  await t.test('Un nombre exacto único tiene prioridad sobre otro local de nombre más largo',async()=>{
    const secundario='00000000-0000-0000-0000-000000000008'
    await db.query('insert into com_locales_monitoreados(id,nombre) values($1,$2)',[secundario,'SUPERMAXI AMERICA NORTE'])
    await auditar(datosAuditados(1.13),(await actual()).token)
    await assert.rejects(async()=>auditar({...datosAuditados(2),lectura_control:{principal:{...evidencia(2),local_nombre:'SUPERMAXI AMERICA NORTE'},control:{...evidencia(2),local_nombre:'SUPERMAXI AMERICA NORTE'}}},(await actual()).token),/otro local|identidad/)
    await db.query('delete from com_locales_monitoreados where id=$1',[secundario])
  })
  await t.test('Nombres exactos duplicados siguen bloqueados: no se elige un local arbitrariamente',async()=>{
    const repetido='00000000-0000-0000-0000-000000000009'
    await db.query('insert into com_locales_monitoreados(id,nombre) values($1,$2)',[repetido,'SUPERMAXI AMERICA'])
    await assert.rejects(async()=>auditar(datosAuditados(2),(await actual()).token),/identidad/)
    assert.equal(Number((await actual()).rotacion_diaria_unidades),1.13)
    await db.query('delete from com_locales_monitoreados where id=$1',[repetido])
  })
  await t.test('Protege el dato manual de sustitución automática y respalda la revisión humana',async()=>{
    await auditar({rotacion_diaria_unidades:1.2,version_validacion:'20261013.2',verificacion_campos:{rotacion_diaria_unidades:{estado:'REVISION_MANUAL',valor:1.2}}},(await actual()).token)
    await assert.rejects(async()=>auditar(datosAuditados(1.13),(await actual()).token),/manual declarado/)
    assert.equal(Number((await actual()).rotacion_diaria_unidades),1.2)
  })
  await t.test('Los mismos controles de permisos y campos protegidos se aplican a auditoría',async()=>{
    await sesion('');await assert.rejects(async()=>auditar(datosAuditados(2),(await actual()).token),/permiso/);await sesion(autor)
    await assert.rejects(async()=>auditar({...datosAuditados(2),caras_percha:0},(await actual()).token),/campo caras_percha/)
    assert.equal((await actual()).datos_ia.caras_percha,6)
  })

  if(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO) await t.test('Granda Centeno real: lectura 1,60 se guarda con el RPC existente y llega al gráfico validado',async()=>{
    const {createServer}=await import('vite'),{fileURLToPath}=await import('node:url')
    const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
    await db.exec('begin')
    try {
      const {reanalizarDiagnosticoCapturaCampo}=await server.ssrLoadModule('/src/utils/reanalizarDiagnosticoCapturasCampo.ts')
      const {guardarLecturaComprobadaCampo}=await server.ssrLoadModule('/src/utils/recuperacionCapturasCampo.ts')
      const {procesarVisitasAutomaticamenteCampo,visitasSinProcesarCampo}=await server.ssrLoadModule('/src/utils/procesamientoAutomaticoCampo.ts')
      const {CAMPOS_CANTIDADES_CAMPO,CAMPOS_FECHAS_CAMPO}=await server.ssrLoadModule('/src/utils/lecturaCapturasCampo.ts')
      const {resumirSemanasCampo,semanasDashboardCampo}=await server.ssrLoadModule('/src/utils/dashboardVisitasRotacion.ts')
      const diagnostico=JSON.parse(await readFile(process.env.CIBUSPAN_DIAGNOSTICO_COMPLETO,'utf8'))
      const fuente=diagnostico.resultados.find(r=>r.id==='6b954b4e-697b-4247-bd96-3a6a484ae90e')
      const lectura=reanalizarDiagnosticoCapturaCampo(fuente.lectura,'7868304262196')
      await db.query('update productos set codigo=$1 where id=$2',['7868304262196',producto])
      await db.query('update com_locales_monitoreados set nombre=$1 where id=$2',['SUPERMAXI GRANDA CENTENO',local])
      await db.exec("update com_visitas_campo_sku set rotacion_diaria_unidades=null, datos_ia=datos_ia-'verificacion_campos'")
      const antes=await actual(), registro={id:detalle,actualizado_en:antes.token,local_id:local,local_nombre:'SUPERMAXI GRANDA CENTENO',
        producto_id:producto,producto_codigo:'7868304262196',cliente_id:cliente,fecha:'2026-10-12',visitado_en:'2026-10-12T12:35:07',
        lectura_guardada:{...Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([c])=>[c,antes[c]==null?null:Number(antes[c])])),...Object.fromEntries(CAMPOS_FECHAS_CAMPO.map(([c])=>[c,antes[c]??null]))},valores:{rotacion:null}}
      assert.equal(await guardarLecturaComprobadaCampo({registro,lectura,locales:[{id:local,nombre:registro.local_nombre}],cancelada:()=>false,
        guardar:datos=>auditar(datos,antes.token)}),true)
      const despues=await actual()
      assert.equal(Number(despues.rotacion_diaria_unidades),1.6)
      assert.equal(despues.datos_ia.verificacion_campos.rotacion_diaria_unidades.estado,'DOBLE_LECTURA')
      const persistido={...registro,lectura_guardada:{rotacion_diaria_unidades:Number(despues.rotacion_diaria_unidades)},verificacion_campos:despues.datos_ia.verificacion_campos,valores:{rotacion:Number(despues.rotacion_diaria_unidades)}}
      assert.equal(resumirSemanasCampo({registros:[persistido],productos:[{id:producto,codigo:registro.producto_codigo,nombre:'Granos'}],semanas:semanasDashboardCampo('2026-10-12'),indicador:'rotacion',soloValidados:true})[0].semanas[4].valor,1.6)
      assert.equal(despues.visita_id,antes.visita_id);assert.deepEqual(despues.capturas_app,antes.capturas_app)
      const completo={...persistido,actualizado_en:despues.token,capturas_app:despues.capturas_app,lectura_almacenada:fuente.lectura,
        lectura_guardada:{...Object.fromEntries(CAMPOS_CANTIDADES_CAMPO.map(([c])=>[c,despues[c]==null?null:Number(despues[c])])),...Object.fromEntries(CAMPOS_FECHAS_CAMPO.map(([c])=>[c,despues[c]??null]))}}
      const resultados=await procesarVisitasAutomaticamenteCampo({registros:[completo],locales:[{id:local,nombre:registro.local_nombre}],
        leerImagenes:async()=>{throw new Error('No debe descargar imágenes ya leídas')},guardar:(r,datos)=>auditar(datos,r.actualizado_en),cancelada:()=>false,progreso:()=>{},resultado:()=>{}})
      assert.equal(resultados[0].estado,'COMPLETADA')
      const automatico=await actual()
      assert.equal(Number(automatico.rotacion_diaria_unidades),1.6)
      assert.equal(visitasSinProcesarCampo([{...completo,lectura_almacenada:automatico.datos_ia}]).length,0)
      const {prepararRevisionDatoCampo,pendientesRevisionCampo}=await server.ssrLoadModule('/src/utils/revisionDatosCampo.ts')
      const paraRevision={...completo,actualizado_en:automatico.token,lectura_almacenada:automatico.datos_ia,verificacion_campos:automatico.datos_ia.verificacion_campos}
      const filasAntes=(await db.query('select count(*)::int as n from com_visitas_campo_sku')).rows[0].n
      await auditar(prepararRevisionDatoCampo(paraRevision,'rotacion_diaria_unidades',1.6),paraRevision.actualizado_en)
      const manual=await actual()
      assert.equal(manual.datos_ia.verificacion_campos.rotacion_diaria_unidades.estado,'REVISION_MANUAL')
      assert.equal(Number(manual.rotacion_diaria_unidades),1.6)
      assert.deepEqual(manual.capturas_app,automatico.capturas_app)
      const actualizado={...paraRevision,lectura_almacenada:manual.datos_ia,verificacion_campos:manual.datos_ia.verificacion_campos}
      assert.equal(pendientesRevisionCampo([actualizado]).some(p=>p.campo==='rotacion_diaria_unidades'),false)
      assert.equal(visitasSinProcesarCampo([actualizado]).length,0)
      assert.equal((await db.query('select count(*)::int as n from com_visitas_campo_sku')).rows[0].n,filasAntes)

    } finally { await db.exec('rollback');await server.close() }
  })

 }finally{await db.close()}
})
