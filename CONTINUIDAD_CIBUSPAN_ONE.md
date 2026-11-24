# Continuidad de CIBUSPAN ONE

24/11/2026, **Tarjeta Impuestos mensuales**.
Sobre main `972b970`. Tabla compacta con período mensual, renta e IVA por separado,
vencimiento, referencia/declaración, detalle, importe manual, pagado, saldo y estado.
Valores inicialmente en blanco: no se calculan tarifas ni se descargan del SRI.
Guardar conserva borradores; enviar publica solo casillas seleccionadas en Cuentas
por pagar. Continúan a Pagos semanales por el flujo existente; solo el pago real
reduce saldo y aparece en Reportes. Un impuesto de cada tipo por mes, revisiones
contra cambios concurrentes, envíos idempotentes y auditoría con responsable/motivo.
Importes/datos se pueden corregir antes de tener programación o pagos. Comparte
el permiso exacto de Cuentas sin habilitar Pagos semanales.
Instalada y registrada únicamente `202611240002_impuestos.sql`, tras comprobar el
historial remoto. Sin registros de prueba en producción. Huellas conservadas:
cuentas `457997f50af3625ccdbc50eeb43347ec`, permisos
`51ed71cf9745cc58dbc3b4b24ba35fd4`, 26 pagos y OID 30866 de vista consolidada.
Lectura authenticated/Teresa correcta, Cuentas=true/semanales=false, anon bloqueado.
Build correcto y Chrome con importes vacíos/editables, selección parcial, mes,
reintento seguro y móvil. Cubiertas 30 pruebas SQL y 28 de permisos: en la primera
ejecución la consulta interna de auditoría del test usaba rol sin lectura de bitácora;
corregido solo el test y reejecutados los tres casos de impuestos correctamente.
Los otros 57 casos de regresión pasaron. Publicación pendiente al registrar este estado.
Archivos: Impuestos.tsx, impuestosRepository.ts, migración, App.tsx,
FinanzasResumen.tsx, FinanzasPagosCompras.tsx, finanzasComprasRepository.ts,
permisosAplicacion.ts, catalogoPermisos.ts y las dos suites de pruebas.

24/11/2026, **Tarjeta Préstamos y cuotas a Cuentas por pagar**.
Sobre main `da59511`. El usuario eligió controlar el total de cuotas por pagar,
sin separar capital e intereses. Acreedor, referencia, fecha, total pactado,
número de cuotas, pago previo y observaciones; cuotas en tabla compacta con
casilla, número real, vencimiento, importe, detalle, pagado y saldo. Solo cuotas
seleccionadas pasan a Cuentas por pagar como PRESTAMO y siguen el flujo existente
de selección → Pagos semanales → pago real. Guardar/enviar/programar no reduce
la deuda. Pagos reales reducen cuota y préstamo y aparecen en reporte mensual;
pago previo es saldo histórico, sin generar desembolsos nuevos. Registrar solo
cuotas pendientes; la suma de estas más el pago previo no puede superar el total.
Bitácora de altas/correcciones/envíos/retiros con responsable y motivo. Revisiones
optimistas y operaciones idempotentes evitan duplicar al reintentar. Bloqueo por
préstamo antes del bloqueo por cuota también en pago/programación. Cuotas con
programación o pagos conservan sus datos; se pueden retirar las no programadas
ni pagadas para corregir y reenviar con la misma identidad. Préstamos comparte
el permiso exacto de Cuentas, sin otorgar Pagos semanales.
Instalada y registrada solo `202611240001_prestamos_cuotas.sql` tras revisar historial remoto;
se preservó OID de la vista de cuentas 30866. Huellas antes/después iguales:
cuentas `457997f50af3625ccdbc50eeb43347ec`, permisos globales
`51ed71cf9745cc58dbc3b4b24ba35fd4`, 26 pagos existentes. Lectura con rol
authenticated/Teresa correcta, Cuentas=true y semanales=false; anon sin acceso.
No se crearon préstamos ni cuotas de prueba en la base real. Pasaron 28 pruebas
SQL y 27 de permisos, Chrome con alta/pago previo/selección parcial/reintento de
envío sin duplicados/Cuentas/cuotas protegidas y móvil, y `npm run build`.
Archivos: Prestamos.tsx/.css, prestamosRepository.ts, App.tsx, FinanzasResumen.tsx,
FinanzasPagosCompras.tsx, finanzasComprasRepository.ts, permisosAplicacion.ts,
catalogoPermisos.ts, migración y dos suites de pruebas. Publicado desde `a961ff2`,
despliegue `b858b261`. Comprobados SHA-256 de 22 archivos públicos de Finanzas,
Préstamos, Reportes, SRI, Roles e índice, además de Supabase operativo, R2 y firma.

23/11/2026, **Tarjeta Reportes en Pagos y Finanzas**.
Sobre main `92fc11d`. Dos reportes iniciales: pagos realizados por fecha del pago
y compras de MP por fecha de recepción física (elección explícita del usuario).
Selector, mes completo, rango de fechas, vista previa de 100 filas por página,
descarga Excel e impresión/Guardar PDF con todas las filas. Cambiar filtros limpia
la vista anterior. Excel mantiene importes numéricos y referencias como texto;
la impresión construye texto seguro sin interpolar HTML de proveedores.
Pagos usa el registro consolidado activo de Excel/SRI/manual/nómina/anticipos:
no cuenta programación, retenciones ni cruces de anticipos como dinero
nuevo. Excluye `APLICACION_ANTICIPO`, deduplica ID dentro de documento y advierte
los pagos sin fecha válida. La advertencia se conserva también en Excel/PDF.
Conciliación real de noviembre coincide con fuentes independientes deduplicadas
por documento e ID: se comprobó que dos pagos constan tanto en SRI como en la
tabla de pagos nuevos y no deben sumarse dos veces. Datos/consultas solo privados.
Hay cuatro pagos de origen sin fecha válida, no asignables a ningún rango, y no
hay recepciones físicas confirmadas actualmente. MP muestra solo esas recepciones,
cantidades por unidad separada y subtotal de línea facturada informativo, sin
inventar valoración de recepciones parciales, compras o entradas desde el saldo inicial.
Instalada y registrada solo `202611230003_reportes_finanzas.sql` tras comprobar
historial; agrega funciones de lectura, sin modificar vistas ni movimientos.
Huella de cuentas `a97484d19962d9124dacacedc8049dd2`, 26 pagos nuevos y permisos
de Teresa conservados. RPC con rol authenticated/Teresa coincide con administrador;
semanales continúa false. Reportes comparte el permiso de Cuentas por pagar.
Pasaron 24 pruebas SQL y 26 de permisos, caso con 1.005 pagos sin truncar, Chrome
con paginación, Excel completo (incluye advertencia), ventana de impresión con
todas las filas, unidades MP, vacío, rango inválido y móvil, y `npm run build`.
Archivos: ReportesFinanzas.tsx/.css, reportesFinanzasRepository.ts,
utils/reportesFinanzas.ts, FinanzasResumen.tsx, App.tsx, permisosAplicacion.ts,
catalogoPermisos.ts, migración y pruebas. Publicado desde `74292b9`, despliegue
`c995ad9e`. Verificados SHA-256 de 17 archivos públicos de Finanzas/SRI/Roles/
índice, los dos del nuevo módulo Reportes y el cálculo compartido de semanas;
Supabase operativo, R2 y firma correctos. Se ignora la caché generada `.wrangler/`.

Incidencia de sesión durante este trabajo: iunda recibió permission denied en
Cuentas, vista SRI y tabla de vínculos. Las concesiones authenticated y el rol
de autenticación estaban correctos; anon seguía sin acceso. El usuario confirmó
que cerrar sesión y volver a ingresar recuperó los datos. No se ampliaron
permisos ni se cambió autenticación para corregirlo.

23/11/2026, **Ancho de columnas ajustable en las tablas de Finanzas**.
Sobre main `dcfb515`. Los bordes derechos de los encabezados permiten arrastrar
el ancho en Cuentas por pagar, Documentos seleccionados y Pagos semanales.
Se guarda en localStorage una preferencia independiente por tabla en este
navegador. Primera interacción captura los anchos visibles y fija el layout;
el arrastre de una columna conserva los demás. Admite flechas (10 px, Shift 25),
Home y doble clic para restablecer la columna; límites 40–900 px, captura de
puntero y soporte táctil. Almacenamiento bloqueado o inválido no rompe la tabla.
Los encabezados mantienen nombres accesibles y el número de columnas del detalle
se deriva de la misma lista. Se mantienen diez filas visibles y el desplazamiento
horizontal dentro del contenedor. No cambia datos, SQL ni permisos.
Chrome comprobó aumentar/reducir, otras columnas sin cambio, persistencia tras
recarga, teclado, doble clic, preferencias independientes en las tres tablas y
móvil sin desbordar la página, además de corrección auditada y envío semanal.
Regresión de semana de emisión/cambio de año/detalles también correcta.
`npm run build` correcto. Archivos de aplicación: FinanzasPagosCompras.tsx,
finanzasPagosCompras.css y hooks/useColumnasAjustables.ts. Publicado desde
`c542fe9`, despliegue `863205f4`. Comprobados SHA-256 de 17 archivos públicos
de Finanzas/SRI/Roles/índice, Supabase operativo, R2 y firma.

23/11/2026, **Vinculación automática de nuevas facturas SRI con Excel**.
Sobre main `6507996`, a petición del usuario para prevenir duplicados futuros.
Instalada y registrada solo `202611230002_vinculos_automaticos_sri_excel.sql`
después de revisar historial remoto (última 001). Trigger AFTER INSERT en SRI:
busca facturas Excel no vinculadas por número completo o secuencial abreviado.
Autoenlaza solo una candidata con proveedor identificado (nombre normalizado
no trivial o alias previamente vinculado a un único RUC), identidad de XML/clave
coherente, fecha y total coincidentes; valida también IVA y bases. Un alias con
RUC distinto, otra serie con el mismo secuencial, varias candidatas, diferencias
de fecha/importes o movimientos propios del XML pasan a revisión. Usa locks de
documento sin esperar un Excel ocupado desde el trigger; ese caso queda pendiente.
Conserva ID financiero, neto, abonos, referencias y plan del Excel; conserva XML.
Solo completa total/IVA faltantes y adopta número/fecha del XML al vincular.
El importador informa Vinculada con Excel o Revisar coincidencia. Sección nueva
en Facturas SRI permite confirmar el Excel elegido o declarar facturas distintas,
con motivo y revisión física obligatorios; exige permisos SRI y Cuentas en servidor
y pantalla. Detecta cambios concurrentes por versión y permite refrescar los datos
antes de resolver. Operaciones idempotentes y decisiones auditadas con responsable.
Los XML pendientes siguen visibles con advertencia; no se pueden seleccionar,
programar ni abonar mientras se decide, con protección también en la base.
No se fusiona automáticamente por secuencial solo ni se reclasifica el histórico
al instalar: tabla de revisiones inicialmente vacía; procesa nuevos ingresos.
Conciliación real antes/después: misma huella de cuentas
`ffe7288255b0eb9a388f9515af0ed566`, 26 pagos y 26 planes, permisos de Teresa
`337751bc5929496e46dbf21833dc9540`, cuatro triggers activos, RPC anónimo bloqueado
y helper de enlace privado. No se insertaron facturas ni pagos de prueba en la base.
Pasaron 20 pruebas SQL (suite de 18 y dos casos adicionales), Chrome de importación
automática/revisión/permisos/bloqueo/móvil, regresión de semana de emisión,
corrección y envío semanal, y `npm run build`. Publicado desde `f6124b2`,
despliegue `242dc40a`. SHA-256 de 17 archivos públicos de Finanzas/SRI/Roles/índice
y el módulo compartido de semanas coincidentes; Supabase operativo, R2 y firma
comprobados. No quedan pasos de instalación o publicación.
Archivos: App.tsx, ComprasSri.tsx, FinanzasPagosCompras.tsx,
comprasSriRepository.ts, VinculosExcelSri.tsx, migración nueva y pruebas SQL.

23/11/2026, **Columna Semana de emisión en Cuentas por pagar**.
Sobre main `b4fa681`. Se agregó la columna junto a Emisión en la tabla principal,
calculada desde `fecha_documento` con la función de semana ISO ya usada por la
aplicación (lunes a domingo, semanas 01–53). Sin fecha muestra guion. El valor
se recalcula al cargar los documentos; no necesita importación ni escritura SQL.
Se ajustó el colspan del detalle. No cambian las tablas inferior/semanal, los
importes, los permisos ni las diez filas visibles. Chrome comprobó 11/11/2026
como semana 46, 01/01/2027 como 53, 04/01/2027 como 01 y fecha ausente, además
de edición con bitácora y selección/envío semanal. Archivo de aplicación
modificado: `src/pages/FinanzasPagosCompras.tsx`; se conserva DashboardV2.
`npm run build` correcto. Publicado desde `906aa09`, despliegue `29ebead3`.
Comprobados SHA-256 de 17 archivos públicos de Finanzas/SRI/Roles/índice más el
módulo compartido del cálculo de semanas; Supabase operativo, R2 y firma correctos.

23/11/2026, **CND 30199 y 30324 vinculadas entre Excel y SRI**.
Sobre main `e4037ae`. El usuario identificó expresamente estos dos pares como
las mismas facturas. Lectura operativa confirmó que Excel tenía los pagos de
112,42 y 11,09 del 13/11, mientras los XML aparecían como deudas nuevas por
115,43 y 11,39. Se usó el vínculo existente `compras_excel_documentos.sri_clave`,
sin eliminar registros, sin crear reglas automáticas por secuencial y sin cambiar
vistas, permisos, código de la aplicación ni esquema. Se conservaron los IDs de
Excel, netos, pagos, referencias y filas originales. Número completo, fecha de
emisión y datos faltantes de total/IVA se completaron según los XML autorizados.
30324 tenía fecha Excel 18/10 frente a emisión XML 13/10: se usa 13/10 y se
conserva la diferencia en observaciones y auditoría. Los XML quedaron intactos.
Transacción con bloqueo de los cuatro documentos y guardas de importes, ausencia
de movimientos adicionales, caja y otras cuentas; dos auditorías
`COMPRAS_VINCULAR_EXCEL_SRI` con responsable y antes/después.
Verificación independiente con rol authenticated/Teresa: dos filas en Cuentas
y dos en Facturas SRI, una por factura. 30199 pagado/neto 112,42; 30324 pagado/neto
11,09; ambos saldos cero. Se suprimió de la proyección la deuda duplicada de
126,82; no se registró dinero adicional ni se borraron pagos. Permisos conservan
la huella `337751bc5929496e46dbf21833dc9540`. `npm run build` correcto. Datos y
SQL solo en `diagnosticos_privados/` ignorado; único archivo versionado modificado:
esta continuidad. No requiere despliegue; la corrección está en la base operativa.

23/11/2026, **Corrección de importes del Excel con bitácora; CND 30608 habilitada**.
Trabajo sobre main `d5a39f3`, conservando los cambios del tablero SKU. El usuario
confirmó retención 3,31 y solicitó editar importes contrastados con factura física
con registro de responsable y cambios. Cuentas por pagar → Detalle → Corregir
importes permite editar subtotal, IVA, total, retención y neto de los documentos
importados del Excel. Abonos y saldo siguen derivados de los movimientos reales.
Motivo y confirmación física obligatorios en la interfaz; base valida permiso
exacto de Cuentas, importes coherentes/no negativos/dos decimales, concurrencia
mediante valores esperados, neto suficiente para pagos/anticipos e idempotencia.
La bitácora por documento muestra fecha, correo responsable, motivo y valores
anteriores/nuevos. También registra `FIN_CORREGIR_IMPORTES_EXCEL` en auditoría.
No permite modificar bases de una retención activa mediante este flujo: remite
a Reglas de retenciones. Conserva el origen Excel y sus filas originales;
sincroniza la proyección SRI y ajusta un plan pendiente solo si debe reducirse.
Instalada y registrada únicamente `202611230001_correccion_importes_excel.sql`
tras revisar historial remoto, sin db push ni migraciones antiguas.
Corrección real ejecutada con motivo explícito de solicitud del usuario:
SOCIEDAD CIVIL CND FACT 30608, subtotal 110,48, IVA 16,57, total 127,05,
retención 3,31, neto/saldo 123,74, abonos cero, semana sin asignar. Antes el neto
estaba nulo por faltar VALOR en la fila 2911. No se creó pago ni comprobante de
retención emitido; la persona usuaria debe elegirla y enviarla a su semana.
La transacción verificó caja y todas las otras cuentas sin cambios. Verificado
con rol authenticated y Teresa: mismos importes en Cuentas y SRI, una corrección
visible, responsable iunda@cibuspan.com, huella de permisos
`337751bc5929496e46dbf21833dc9540` sin cambios. SQL de datos solo en diagnósticos
privados ignorados. Pasaron doce pruebas SQL y comprobación adicional de lector
solo SRI; Chrome comprobó bloqueo inicial, edición, bitácora y envío a semana;
`npm run build` correcto. Publicado desde `5ee448f`, despliegue `00f8ab6a`.
SHA-256 de 17 archivos públicos de Finanzas/SRI/Roles/índice y dos de PanoramaSku
coincidentes; Supabase operativo, R2 y firma comprobados. No quedan pasos de
instalación o publicación para esta corrección. La factura está lista para que
el usuario la seleccione y asigne a la semana que corresponda, sin pago ejecutado.
Archivos: CorreccionImportesExcel.tsx, FinanzasPagosCompras.tsx,
finanzasComprasRepository.ts, migración nueva y verificar_sueldo_retenciones_sql.mjs.

20/11/2026, **Movimiento de SKU: resultado tras CIF y gastos generales, publicado y comprobado**.
Lectura del Supabase operativo confirmó que el anillo anterior mostraba contribución
directa: las devoluciones ya reducían el neto, pero faltaban CIF y generales.
El usuario eligió expresamente repartir CIF por unidades facturadas, indicado como
estimación en este tablero, porque septiembre contiene 120 unidades históricas sin
equivalencia de kilos. No cambia la regla guardada del ERP ni inventa equivalencias.
Los rubros del balance se concilian y reparten antes de filtrar cliente/SKU;
generales conserva su regla guardada. Depreciaciones incluidas una vez dentro de
CIF/generales, sin sumar además el costo de venta contable completo.
Septiembre: CIF 2.481,48; generales 11.725,08; depreciaciones incluidas 1.549,73.
Repartos conciliados y sin costos sin asignar. Agosto mantiene ocho líneas devueltas
sin importe comprobado: su reparto por neto y resultado completo quedan pendientes,
con enlace para revisar el documento. No se inventan importes.
Anillo, indicadores, rankings y tabla muestran resultado/margen tras gastos;
conservan la contribución anterior identificada. Facturado, descuentos y devoluciones
se muestran antes del neto para evitar una segunda deducción. Estimación gerencial
con materiales vigentes, antes de intereses e impuestos; no es utilidad neta ni
resultado contable oficial. DashboardV2 y periodo PDV conservados.
52 pruebas aprobadas, auditoría real por SELECT y compilación oficial completadas.
Publicado desde `cbfd86a`, despliegue `3fbf882f-cf03-44e8-8806-3f45b8b1197e`,
`https://3fbf882f.cibuspan-one.pages.dev`. Dominio principal comprobado por SHA-256
del bundle principal, PanoramaSku, ReglasRetenciones y ComprasSri contra dist.
No se completó recorrido autenticado de la interfaz; los cálculos se comprobaron
con registros reales mediante lectura y pruebas. Archivos: distribucionCostosSku.ts,
tableroSku.ts, tableroSkuRepository.ts, PanoramaSku.tsx/.css, PanoramaGraficosSku.tsx
y verificar_panorama_sku.mjs. Sin SQL de escritura ni cambios de base de datos.

20/11/2026, **Rotación PDV separada del mes contable, preparada localmente**.
Iván señaló gráficos vacíos pese a tener visitas. El código usaba el rango del
balance para consultar PDV. La corrección local busca la última visita confirmada
con rotación de un SKU activo asignado al cliente seleccionado y consulta los
28 días inclusivos hasta esa fecha. Mantiene las validaciones existentes de cada
medición; no inventa valores ni modifica el dashboard semanal. La pantalla indica
por separado mes financiero y rango PDV, permite abrir Visitas PDV y distingue
carga, error de fuente, ausencia de visitas y mediciones pendientes.
46 pruebas locales aprobadas tras integrar las actualizaciones oficiales de
finanzas y compilación correcta con configuración del Supabase operativo. El bloqueo de la revisión
automática por cuota se levantó después de su hora de reinicio; se retomaron las
operaciones por la misma revisión, sin eludirla. Lectura SELECT del Supabase
operativo confirmó 1.184 rotaciones guardadas de Favorita, con visitas desde
22/09/2026 hasta 19/11/2026; Rosado 43 rotaciones hasta 13/10/2026 y Santamaría
ocho hasta 14/10/2026. Estos conteos son de valores guardados, no certifican que
todos estén verificados. Auditoría con registros reales y el mismo validador del
tablero: Favorita, 23/10–19/11, 645 mediciones, 40 locales con rotación y 290 pares
SKU/local, 26 mediciones semanales pendientes; Rosado cinco locales/34 pares y
Santamaría tres locales/ocho pares en sus respectivas ventanas recientes.
**Publicado y comprobado** desde `eb28c18`, integrado con las actualizaciones de
main hasta `e474c68`, despliegue `b3a58202-e9bd-40b1-aaf4-740516fce110`, URL
`https://b3a58202.cibuspan-one.pages.dev`. Dominio principal verificado por SHA-256
del bundle principal, PanoramaSku, ReglasRetenciones y ComprasSri frente al paquete
local comprobado. No se ejecutó SQL de escritura ni se cambiaron visitas. Falta
recorrido autenticado del nuevo filtro PDV en producción; la comprobación de
rankings se realizó con los registros reales y sus validaciones, por lectura.

La corrección anterior de margen/meses/enlaces **sí terminó su despliegue**, según
Wrangler: `https://967c22cf.cibuspan-one.pages.dev`, fuente `c0f139e`, integrada
con `ed0b453` (permisos SRI). Pasaron 41 pruebas de tablero/permisos y una SQL SRI
local tras integrar main; compilación oficial correcta. La comprobación posterior
del dominio por SHA-256 no se ejecutó debido al límite de la revisión automática.
No afirmar que esa comprobación pública se completó. No se modificaron importes.

Cálculos editables pendientes de emisión, 20/11/2026, sobre `3a29fd1`.
El usuario confirmó expresamente que la carga de hoy debe ser de cálculos, no de
comprobantes emitidos. Instalada y registrada solo la migración nueva
`202611200009_retenciones_calculadas.sql`; 008 también está instalada y publicada
desde `3a29fd1` (despliegue `6789ab13`, 17 archivos públicos comprobados).
009 distingue CALCULADA/EMITIDA, permite corregir un cálculo con historial y
promoverlo únicamente al registrar la referencia real. La corrección vuelve al
neto anterior a retenciones y evita descontar dos veces. Ambas operaciones
mantienen permisos, bloqueo de documento, límites de importe, auditoría,
idempotencia y conciliación con abonos/anticipos/plan. El importe sigue editable
en Pagos y Finanzas → Reglas de retenciones → Calcular / detalle.
Se cargaron nueve cálculos autorizados, sin comprobantes, por USD 201,32, de los
trece XML subidos el 20/11 en America/Guayaquil. EDUEXPRESS 33346: 9,80, neto
480,20. Transporte 1328: 1,40, conserva abono 138,60 y queda saldo cero, sin crear
un nuevo pago. Los cálculos son estimaciones bajo régimen general provisional
según XML/concepto; requieren confirmar RUC vigente antes de emitir. En las dos
facturas de diseño web/redes se usa IVA 70% del historial, con motivo explícito
de confirmar que no corresponda el supuesto profesional de IVA 100%. GLOBAL
FLEXOGRAPHY usa bienes, con aviso de historial insuficiente. No presentarlos
como tratamientos fiscales confirmados ni como comprobantes emitidos.
Cuatro documentos siguen sin descuento y con marca visible Revisar retención:
recuperación de descuento y procesamiento de información de CORPORACION
FAVORITA; compra mixta de AVILA; asesoría de YANEZ. Los motivos se conservan
en metadatos de SRI y auditoría, visibles en SRI y detalle de Finanzas.
La carga transaccional comprobó caja y todas las otras cuentas sin cambios.
Lectura posterior independiente: nueve CALCULADAS por 201,32, cero EMITIDAS.
Datos y SQL de carga solo en `diagnosticos_privados/retenciones_2026/` ignorado.
Pasaron nueve pruebas SQL, Chrome de creación/reapertura/corrección/emisión con
referencia, y `npm run build`. También pasó la regresión de importe manual,
neto semanal 109,50, Sueldo por mes y móvil sin desborde. Consulta con rol
authenticated y usuario Teresa: ve nueve calculadas y cuatro revisiones tanto
en Cuentas como en SRI; permisos Cuentas true, semanales false, huella
`337751bc5929496e46dbf21833dc9540` sin cambios.
Publicado desde `462aa60`, despliegue `4df34e3b`. Comprobados SHA-256 de los
17 archivos públicos, Supabase operativo, R2 y firma. No quedan pasos de
instalación/publicación; las cuatro clasificaciones y las confirmaciones fiscales
indicadas en los motivos siguen pendientes de revisión antes de emitir.

Importe de retención editable, 20/11/2026, preparado sobre `ffe4cb3`. El usuario
pidió poder corregir el importe y registrar retenciones a las facturas subidas
hoy. En Reglas de retenciones, cada línea de renta/IVA tiene un campo Retenido
editable, que parte del cálculo y admite volver a él. Se conserva el valor
calculado, el corregido y la marca de ajuste en el detalle; requiere motivo.
SQL nuevo exclusivo `202611200008_retenciones_importe_editable.sql` mantiene la
autorización, confirmación, comprobante, idempotencia y conciliación existentes.
Valida importes no negativos, dos decimales, IVA hasta su base, renta hasta el
10% de su base, y cero en reglas sin retención. El saldo y el plan usan el valor
efectivo. Pasaron ocho pruebas SQL y Chrome con cambio manual 6,50 a 5,50,
plan/pago neto 109,50 y cero explícito; `npm run build` correcto.
Consulta de carga de hoy (20/11 en America/Guayaquil): trece XML, no trece fechas
de emisión de hoy. La factura de transporte 1328 tiene abono 138,60 sobre 140 y
saldo 1,40. Ninguna tiene retención activa registrada. EDUEXPRESS 33346 tiene
IVA cero, base 490, XML sin mención RIMPE y agente 1; se informó 9,80 de renta
condicionado a régimen general, sin registrarlo. Hay conceptos mixtos y casos
que requieren clasificación, no aplicar una tasa general a los trece.
Se preguntó si ya hay comprobantes emitidos o se desean cálculos editables
pendientes de emisión. El usuario respondió después que desea cálculos; ver el
estado actualizado de 009 arriba. Para registrar como emitidas se requieren
sus referencias; no inventarlas ni eludir la guarda.
Detalle y consultas solo en `diagnosticos_privados/retenciones_2026/`.
008 instalada y publicada; la carga de hoy se resolvió con 009, según lo indicado arriba.

Reglas futuras por historial y sugerencia al ingresar XML, 20/11/2026.
Preparado sobre `f7f4891`, a petición expresa de cargar reglas del PDF. Nueva
migración `202611200007_historial_reglas_iva.sql`: fuentes y observaciones
contables separadas de retenciones emitidas, perfiles por RUC y carga idempotente
auditada. El reporte revisado aporta 640 facturas de 90 proveedores. La prueba
local con todos sus datos coincide con la conciliación anterior: 20 perfiles
positivos uniformes con tres o más muestras, 13 ceros por revisar, siete variables,
29 insuficientes y 21 sin IVA. Solo los primeros sugieren un importe, sobre el
IVA de documentos posteriores al período histórico y con RUC exacto. No se
vinculan por alias/nombre ni se completa automáticamente el RUC del Excel.
Facturas SRI muestra una columna nueva de IVA sugerido al cargar el XML. En
Reglas de retenciones se consultan los perfiles, conteos y fuente/página de
ejemplo, y se muestra la sugerencia al revisar un documento. Siempre requiere
verificar concepto y condición actual antes de registrar la retención; renta
permanece manual. Notas de venta muestran una indicación de revisión al ingresar,
sin presumir retenciones. Se agrega al catálogo el caso de IVA 100% por arriendo
de inmueble de persona natural, para no confundirlo con honorarios profesionales.
El importador del historial y la consulta no alteran cuentas, saldos, planes,
comprobantes ni caja. No se cargan los datos personales en Git: payload y SQL de
datos privados solo en `diagnosticos_privados/retenciones_2026/`.
Pasaron 36 pruebas de historial/permisos/retenciones/SRI, prueba local del payload
completo y reintento, Chrome con carga real de XML simulado y consulta de reglas,
móvil sin desborde, y `npm run build`. Instalada y registrada únicamente la
migración nueva `202611200007`. Cargado el historial autorizado mediante el RPC:
640 observaciones y 90 perfiles con los estados esperados; una auditoría de carga.
La consulta operativa confirmó las mismas huellas de saldos y definición de la
vista de cuentas, 21 pagos, 23 planes y cero retenciones emitidas registradas.
Teresa consulta los 90 perfiles con los mismos permisos: Cuentas true, semanal
false y huella conservada. Publicado desde `6a7efa2`, despliegue `e83d35b8`;
SHA-256 de 17 archivos públicos de índice, Finanzas, Roles, SRI, sugerencias,
documentos y estilos coincidentes. Supabase operativo/R2/firma comprobados.

Conciliación preliminar del PDF de retenciones, 20/11/2026, sobre `686d8b2`.
El usuario entregó `RETENCIONES 2026.pdf`, reporte contable de enero-septiembre.
Se extrajeron y comprobaron las 676 filas, incluidas doce partidas entre páginas:
640 facturas, 27 notas de venta y nueve notas de crédito. Las notas de crédito
se restan para conciliar todos los totales: compras netas USD 397.418,69 y
retenciones de IVA USD 6.210,62. El PDF no contiene renta, números de comprobante
de retención ni estados de anulación; no permite registrar por sí solo retenciones
fiscales completas. Consulta de solo lectura: 593 cuentas SRI/notas del período.
Se hallaron 355 coincidencias preliminares por nombre compatible, secuencial,
fecha y total con tolerancia USD 0,01; sin RUC en esos registros Excel. Otras
54 requieren revisar diferencias, dos son ambiguas y 256 no tienen coincidencia;
nueve notas de crédito quedaron separadas. No se deben importar como confirmadas
ni completar RUC automáticamente a partir de esa comparación.
Historial por RUC: 33 proveedores con tasa uniforme observada en tres o más
facturas con IVA y siete con tasas variables. Lectura de 63 documentos pendientes
de octubre a 20/11: trece estimaciones orientativas de IVA, diez con descuento
ya incluido en el neto; no volver a restarlo. Renta no se estima por diferencia
entre neto y total. Revisar concepto, régimen y calificación actual del proveedor.
Extracción, JSON, SQL SELECT, scripts y conciliación solo en el directorio ignorado
`diagnosticos_privados/retenciones_2026/`. Se preparó un Excel de revisión fuera
del repositorio, con Cruce, Sugerencias IVA y Proveedores. No se importaron perfiles,
no se aplicaron retenciones y no cambiaron saldos, pagos ni permisos. Pendiente
confirmar identidades/diferencias y disponer del detalle de renta y comprobantes
antes de una importación a la aplicación. No hubo cambios de código ni publicación.

Sueldo, retenciones y flujo de pagos, 20/11/2026. Preparado sobre `5e7f1d4`.
Pagos nómina agrega SUELDO con el mes seleccionado, importe inicialmente vacío
y editable, sin cambiar el destino Cuentas por pagar. La tabla de Cuentas por
pagar conserva selección, tabla inferior y Detalle; Abonar/Pagar solo aparecen
en Pagos semanales. Nueva tarjeta Reglas de retenciones, con el mismo permiso
exacto de Cuentas por pagar. El usuario confirmó que CIBUSPAN es agente de
retención; no se la configura como contribuyente especial. Catálogo de casos
frecuentes de renta (NAC-DGERCGC26-00000009, desde marzo/2026) e IVA (cuadro
vigente del SRI y NAC-DGERCGC20-00000061/reformas), con fuente y vigencia.
El operador verifica régimen, fecha del pago/crédito en cuenta, bases y reglas;
admite bases separadas para facturas mixtas. Renta sobre base sin IVA e IVA
sobre el impuesto, calculados también en SQL. Notas de venta: este flujo solo
admite RIMPE Negocio Popular sin IVA, sin retención; otros casos requieren
revisión. Casos no incluidos no se clasifican automáticamente.
Se registra el comprobante ya emitido: no hay emisión/autorización electrónica
ni anulación ante el SRI. El descuento se guarda separado de la caja, sustituye
el ya incluido en el neto XML/Excel/manual según su fuente y ajusta el pendiente
semanal. El estado de SRI usa también ese neto; preserva los créditos de anticipos.
Registro idempotente con comprobante y confirmación, auditoría y anulación local
con motivo; protege importes frente a edición mientras hay retención activa.
Pruebas SQL de Sueldo/mes/reintento, netos, notas, Excel, factura mixta,
programación, pago, anticipo, anulación y permisos correctas. Chrome comprobó
ausencia de pagos directos en Cuentas, cálculo 6,50/neto 108,50, selección y pago
semanal, Sueldo octubre/2026 a Cuentas y móvil sin desborde. Pasaron las 36 pruebas
de SQL/permisos de Finanzas, anticipos y estos cambios, y `npm run build`.
Se instalaron únicamente `202611200005_nomina_sueldo.sql` y
`202611200006_retenciones_documentos.sql`, y se registraron ambas versiones tras
su ejecución correcta. Publicado desde `cda8d85`, despliegue `1334d3c3`; SHA-256
públicos de catorce archivos de índice, Finanzas, Retenciones, SRI, Anticipos,
Roles y nómina coincidentes con la compilación. Supabase operativo/R2/firma
comprobados. Verificación real con Teresa: 779 cuentas, once reglas y cero
retenciones; permiso de Cuentas true y semanal false, huella de permisos intacta.
Instalación: catorce obligaciones de nómina, 21 pagos, 22 programaciones y cero
saldos cambiados; conteos de cuentas y facturas conservados. No se registraron
pagos, obligaciones de nómina ni retenciones de prueba en la base operativa.

Anticipos a proveedores, 20/11/2026. Preparado sobre `6bbb8cf`. Nueva opción en
Compras → Facturas de compras → Anticipos, también accesible desde Cuentas por
pagar. Hereda el permiso exacto de Cuentas por pagar; ejecutar Pagos semanales
conserva su permiso independiente. Registro compacto, selección de importes y
semana; pago por el flujo semanal existente. El cruce manual posterior usa solo
el importe efectivamente pagado y disponible, conserva la referencia del depósito
y admite aplicaciones parciales o completas a facturas XML/Excel. Actualiza el
saldo en Finanzas y el estado de Facturas SRI sin generar otra salida de caja.
Si hay un pago semanal pendiente de la factura, reduce ese pendiente al saldo
restante. Compara el RUC cuando ambos documentos lo tienen y exige confirmar el
proveedor. Operaciones con UUID idempotente, bloqueos y auditoría del cruce.
Pasaron 29 pruebas de SQL/permisos, Chrome con JEFA_FACTURACION para alta,
programación de otra semana, pago, cruce móvil y factura SRI pagada, y
`npm run build`. Las pruebas utilizaron datos simulados; no se hicieron pagos
reales. Instalado exclusivamente `202611200004_anticipos_proveedores.sql` y
registrada esa versión tras su ejecución correcta. Publicado desde `4711747`,
despliegue `991d3c86`. Coincidieron los SHA-256 públicos de diez archivos de
índice, Finanzas, Anticipos, Roles y nómina; Supabase operativo/R2/firma comprobados.
Lectura real con el perfil de Teresa: 778 cuentas y cero anticipos; Cuentas por
pagar permitido, Pagos semanales denegado y huella de permisos conservada.
La verificación posterior confirmó cero cruces y los conteos de las vistas de
cuentas/facturas iguales a sus fuentes anteriores. Los pagos reales siguieron
aumentando por la operación de los usuarios durante la publicación; no se
usaron conteos anteriores como una instantánea fija ni se modificaron esos pagos.

Selección completa por permiso de Cuentas por pagar, 20/11/2026. Se corrige el criterio anterior: las casillas, montos y tabla inferior forman parte del permiso de Cuentas por pagar y aparecen para todos sus usuarios. Programar esa selección usa el mismo permiso; si no se puede abrir Pagos semanales, confirma el guardado y continúa en Cuentas por pagar. Pagos semanales también usa el permiso exacto asignado para consulta, ejecución y retiro, con el mismo comportamiento entre roles autorizados. No se asignan permisos automáticamente. Pasaron Chrome con JEFA_FACTURACION y administrador, 24 pruebas de SQL/catálogo y npm run build. Se instaló y registró únicamente `202611200003_finanzas_seleccion_por_modulo.sql`. Publicado desde `c422032`, despliegue `2c48b9f5`. La lectura con el perfil de Teresa confirmó la autorización de programación desde Cuentas por pagar y 778 cuentas, con la misma huella de permisos. Coincidieron los SHA-256 públicos de los siete archivos verificados de índice, Finanzas y Roles; Supabase/R2/firma comprobados.

20/11/2026, **Auditoría y corrección del Panorama SKU solicitadas por Iván**.
Lecturas SELECT en `eodcwkuexldsbomflthe` comprobaron que septiembre/2026 es el
último balance cargado y cerrado; octubre figura sin cerrar. Filtro cambiado a
mes/año sobre balances con cierre confirmado, por defecto el último disponible.
El aviso de agosto incluía 12 ventas de clientes ajenos a Favorita: corregido su
alcance por cliente/SKU, sin cambiar esos registros. Ocho líneas de Favorita sin
precio ni total pertenecen al documento `0202621900031` del 07/08/2026; afectan a
ocho SKU y explican que solo Manjar y Chocobits tuvieran aporte calculable.
Los avisos ahora abren las líneas concretas y enlazan directamente ese documento
en el historial de Devoluciones. No se estimaron ni completaron importes.
La fuente anterior de gastos (facturas) no contenía el transporte ni gastos
históricos de agosto/septiembre. El tablero ahora usa exclusivamente el gasto
específico por cliente del libro mayor clasificado y concilia su suma con el
balance mensual; sustituye las facturas y la distribución de nómina para evitar
duplicarlas. Conserva MOD de nómina y materiales vigentes; no modifica el reporte
de rentabilidad ni pretende cuadrar el EBITDA contable. Auditoría local con
fuentes reales de agosto: Manjar 44,31 % y Chocobits 41,64 %, ambos aún únicos
calculables en ese filtro. Septiembre/Favorita tiene 10 SKU calculables y cero
devoluciones sin importe. Sin costos sin distribuir y gasto conciliado en ambos
meses. Datos de auditoría solo en `.wrangler/`, no versionados.
Ranking rotulado como aporte USD frente a margen %; con cinco o menos SKU
calculables muestra "Margen de los SKU calculados", no los califica de peores.
40 pruebas aprobadas y compilación correcta con Supabase operativo. Pendiente
completar/verificar publicación de esta corrección. Ningún dato fue modificado.

Acceso a Finanzas por permisos asignados, 20/11/2026. El caso de tsamaniego@cibuspan.com confirmó Cuentas por Pagar y Roles de pago autorizados, y Pagos semanales denegado. App enviaba Cuentas por pagar al registro anterior cuando faltaba el permiso semanal. Se retira ese desvío y se muestran las acciones semanales solo a quienes pueden abrir esa pantalla. Las consultas de cuentas y de gestión de Roles usan RPC con autorización exacta y perfil activo, sin ampliar el acceso directo a las tablas fuente. La migración nueva `202611200002_finanzas_permisos_asignados.sql` adapta las guardas de las funciones propias de Finanzas a esas rutas. La autorización semanal permanece independiente. Pasaron las pruebas SQL de autorización/revocación/inactivo, consulta de XML/Excel/manual/histórico, pago directo y protección semanal; Chrome con JEFA_FACTURACION y administrador y npm run build. Se aplicó y registró únicamente esa versión. La lectura operativa con el perfil de Teresa devolvió 766 cuentas, 16 personas, 9 roles importados y 27 filas de resumen. Su permiso semanal sigue en false y el hash de sus permisos coincide con el anterior. Publicado desde `f9afb51`, despliegue `68a27215`. Coincidieron los SHA-256 del índice, ambos módulos de Finanzas, Roles, sus estilos y el repositorio de nómina en el dominio público; Supabase/R2/firma comprobados. Pendiente que Teresa actualice su app para cargar esta versión.

20/11/2026, **Facturas SRI asignable a otros roles**. Preparado sobre `c3269cb`.
El catálogo compartido permite marcar Facturas SRI en Usuarios y Permisos para
cualquier rol. Se mantiene el acceso por permiso exacto y su denegación explícita.
SQL nuevo exclusivo `202611200001_compras_sri_permisos.sql` agrega autorización
para perfiles activos en lectura/importación/XML/RIDE, edición y detalle de
facturas XML/Excel. La recepción conserva los permisos adicionales del Kardex.
Los pagos existentes de facturas Excel se muestran en su detalle. Registrar o
programar pagos conserva su autorización propia. No se asignan usuarios al instalar.
25 pruebas locales de permisos, SQL SRI, Excel y recepción aprobadas y
`npm run build` correcto con la configuración pública del Supabase operativo.
Funciones y políticas reales revisadas antes de instalar. Conteos previos
13 XML, 746 documentos Excel, dos pagos y cero recepciones. Instalación,
registro de la versión y publicación completados por el agente desde `ffaf5f0`.
Despliegue `e61b7e24`, dominio principal verificado por SHA-256 del índice,
bundle principal y módulo UsuariosPermisos. Las seis políticas y los dos RPC
de edición/detalle usan el permiso nuevo, autenticado permitido y anónimo
bloqueado. Conteos posteriores iguales a los previos. Registrada únicamente
la versión `202611200001`. Supabase operativo, R2 y firma comprobados.
Renderizado de la casilla habilitada comprobado para Facturación, Gerencia,
Bodega y KAM. El administrador puede asignarla a las personas elegidas y
guardar permisos; queda pendiente que el usuario seleccione a los destinatarios
y compruebe su acceso con las sesiones reales.

20/11/2026, **Panorama SKU aprobado para publicar e integrado con fuentes reales**.
La ruta `Dashboard · SKU` / Dashboards → Movimiento de SKU utiliza ahora
`src/pages/PanoramaSku.tsx`, sin pestañas, con los ocho gráficos aprobados, filtros
y detalle. `calculoRentabilidadSku.ts` extrae el cálculo existente del reporte;
el reporte conserva su atribución de devoluciones por origen y su comportamiento.
El tablero usa explícitamente fecha de registro para empatar con sus cantidades
devueltas. Comparte descuentos registrados, costos vigentes, distribución de nómina,
transporte y gasto directo del cliente; se distribuye antes de filtrar. Los gastos
y nómina se toman por mes, sin prorratear días, igual que el reporte. Fuentes
fallidas/costos incompletos o sin distribuir dejan el aporte pendiente; no se
presentan como ceros. Solo SKU activos con asignación activa al cliente.
**Publicado y comprobado** en Cloudflare Production/main, despliegue
`3d5eef6a-389e-4f4e-9bc0-7c47671ace6b`, fuente `12c12fc`, URL
`https://3d5eef6a.cibuspan-one.pages.dev`. El dominio principal
`https://cibuspan-one.pages.dev` sirve el index nuevo y
`PanoramaSku-C4uJ23xT.js` idéntico por SHA-256 al paquete local comprobado,
sin datos de ejemplo. Código en GitHub main. Se comprobó la sesión abierta de
producción sin navegar ni recargar su formulario de pagos seleccionado; falta
el recorrido autenticado del nuevo tablero con cifras reales y aceptación operativa.
34 pruebas de cálculo, visitas y permisos aprobadas. Compilación final para
`eodcwkuexldsbomflthe` con configuración pública recuperada de la publicación actual
y Auth comprobado; no usar `.env.local` como destino. No se ejecutó SQL ni se
modificaron datos.

20/11/2026, **Tercera propuesta SKU: panorama gráfico sin pestañas**. El usuario
rechazó la alternativa con pestañas y pidió todos los indicadores en una sola vista,
con gráficos más vistosos. `pruebas/vista_preliminar_sku/panorama.html` presenta
cuatro KPI, señales de pérdida/sin venta y ocho gráficos juntos: columnas de más
vendidos, menor venta, devoluciones, anillo de costos/aporte, mayor aporte, menor
margen, rotación por local e intensidad SKU/local. Detalle completo y metodología
debajo, en la misma página, sin paneles ocultos ni navegación por pestañas. Usa
los mismos datos ficticios y servidor local 5192; no integra aún rentabilidad real.
Compilación del ejemplo y `npm run build` correctas. Abierta como entrega en el
navegador de Codex; árbol accesible confirma métricas, ocho gráficos y tabla.
La captura visual falló y Chrome estaba minimizado; no certificar revisión visual
final ni recorrido móvil. Pendiente opinión del usuario. Sin publicación ni SQL.

20/11/2026, **Segunda alternativa visual del tablero SKU, solo preliminar**.
`pruebas/vista_preliminar_sku/claro.html` conserva los mismos datos ficticios del
primer estilo y los agrupa en Resumen, Ventas, Devoluciones, Rentabilidad, Rotación
y Detalle. Estilo claro con cuatro indicadores principales, puntos para revisar,
rankings por sección y metodología desplegable. El detalle conserva costos,
descuentos, devoluciones, aporte y margen; los promedios de rotación reutilizan la
misma utilidad del tablero. Filtros sobre fechas del ejemplo, cliente y SKU;
pulsar un SKU abre su detalle. Enlace para comparar con la alternativa anterior.
Mismo servidor local 5192. Compilación del preliminar correcta y pantalla principal
comprobada visualmente en Chrome; no se certifica aún recorrido móvil ni integración
de rentabilidad con datos reales. Sin publicación ni cambios en la base de datos.

20/11/2026, **Contribución y margen añadidos solo a la vista preliminar solicitada**.
El ejemplo reproducible está en `pruebas/vista_preliminar_sku/`; se inicia con
`node pruebas/vista_preliminar_sku/servidor.mjs` y abre el puerto local 5192.
Incluye venta neta comercial, aporte tras descuentos/devoluciones y costos
directos (materiales/empaques, mano de obra, transporte y gasto del cliente), margen
calculado sobre totales, top 5 por aporte, top 5 por menor margen, pérdidas en rojo
y desglose por SKU. Datos ficticios identificados en pantalla, sin conexión a
Supabase ni escritura. `TableroSku` admite un panel opcional para este preliminar;
la ruta normal todavía no recibe este panel. **Pendiente integrar el cálculo real
del reporte de rentabilidad antes de ofrecer estos indicadores en producción**.
Compiladas la aplicación y la vista de ejemplo. Abierta en Chrome y comprobada la
sección nueva con aporte $1.675,30, margen 23,1 % y un SKU con pérdida (ejemplos,
no resultados de la empresa). No se publicó ni se ejecutó SQL. La revisión visual
se limita a esta vista de ejemplo; falta aceptación operativa y datos reales.

20/11/2026, **Movimiento de SKU implementado; pendiente de publicar**. Nueva
entrada en Dashboards, con el mismo permiso de Dashboard Comercial. Combina ventas
diarias, devoluciones, visitas y costos de materiales mediante consultas existentes;
no requiere SQL ni modifica datos. Filtros por periodo, cliente y SKU, limitados a
productos activos con asignación activa Cliente–Producto. Incluye seis top 5:
mayor/menor venta positiva, más devoluciones, mayor aporte tras devoluciones y
materiales, locales por rotación promedio y combinaciones SKU/local. Los SKU sin
venta se muestran aparte. El aporte usa costo de materiales vigente y no equivale
a utilidad completa: mano de obra, transporte y gastos siguen en Rentabilidad por
SKU. Devoluciones por su fecha de registro, sin atribuirlas a la venta de origen.
Rotación: última visita por SKU/local/semana, valores verificados o manuales;
cobertura visible, sin imputar semanas ausentes ni cambiar el dashboard semanal.
Las fuentes fallidas y valores incompletos se muestran como pendientes. Compilación
correcta y 28 pruebas de cálculos/permisos aprobadas. Recorrido visual pendiente:
el navegador de pruebas no pudo acceder al servidor local. No se consultaron ni
modificaron datos productivos para estas pruebas. No desplegar el build local de
validación: se generó con clave de prueba; publicar con la configuración oficial.

19/11/2026, **Casa Masa instalado y publicado por el agente**. SQL exclusivo
`202611190002_casa_masa_empaque.sql` ejecutado en `eodcwkuexldsbomflthe`, diagnóstico
`correcto=true` con los cuatro SKU activos, RLS, escritura protegida, anónimo denegado,
vista privada, exclusión de demanda CM y control de despacho. Registrada únicamente
esa versión. `admin-users` actualizado a v3, ACTIVE, conservando `verify_jwt=false`
ya existente y la validación interna de sesión/administrador; config.toml registra
ese valor para no cambiarlo en posteriores despliegues. Cloudflare main publicado
en `https://3b2846f2.cibuspan-one.pages.dev`, desde la integración `006b238` y esa
configuración conservada. El dominio público sirve JS idéntico al build de entrada,
Casa Masa, Fórmulas y Compras SRI; endpoint de capturas conserva contingencia, R2 y firma.
41 pruebas locales comprobadas y compilación integrada correctas. No se crearon
pedidos, pagos ni movimientos de inventario reales. Falta recorrido visual y aceptación
operativa; no certificar pedido/reserva/despacho real completo. Cobros/comprobantes,
facturación, WhatsApp y registro de fabricación diaria siguen pendientes. No pedir
al propietario volver a ejecutar este instalador ni copiar comandos por rutina.

19/11/2026, continuidad operativa CM: Iván confirma que el agente debe ejecutar
también instalaciones y publicaciones con las sesiones disponibles, sin delegarle
comandos por rutina. Se comprobó por CLI y bundle público que producción utiliza
`eodcwkuexldsbomflthe`, ACTIVE_HEALTHY; el proyecto original y recuperación figuran
INACTIVE. `.env.local` y el enlace local del CLI todavía apuntan al original;
no cambiarlos ni utilizarlos como destino implícito de publicación/SQL.
R2 y firma presentes contra contingencia. Se integraron los avances oficiales
hasta `79def68`, conservando Compras, Finanzas, Formulación y permisos por submenú.
Casa Masa utiliza la versión libre `202611190002`; `202611190001` corresponde a
ingredientes y no debe repararse por CM. Los cuatro SKU CM están activos, verificados
en la base real. Instalador corregido para detectar y conservar la conexión pública,
usar el destino explícito sin relink y leer el JSON con `rows` del CLI actual.
Este fue el estado previo a la instalación, completada y verificada arriba.

19/11/2026, primera implementación CM preparada: **Casa Masa → Pedidos y empaque**,
registro central recuperable de pedidos de los cuatro SKU, tarjetas por fechas,
contacto/dirección/responsable/repartidor, etapas de empaque con auditoría y control
de versión, verificación de reserva completa y enlace al despacho del pedido.
SQL nuevo `202611190002_casa_masa_empaque.sql` excluye los detalles CM de ambos
cálculos de demanda antes de agrupar por producto base; no fabrica ni carga stock.
Permiso propio y lista válida de `admin-users` actualizados. Instalador exclusivo
`scripts/Instalar-CasaMasa.ps1`, sin db push ni reparación de versiones anteriores.
32 pruebas locales aprobadas y build correcto. SQL probado en PGlite con registro
real y auxiliares modelados; base real no consultada ni modificada. Revisión visual
pendiente por fallo de conexión/herramienta de navegador. Instalación, actualización
de la función admin-users y publicación pendientes. Ver `docs/CASA_MASA.md`.
Cobros, facturación, WhatsApp y registro de fabricación diaria todavía pendientes;
no trasladar pedidos históricos de otro canal automáticamente.

19/11/2026: inicio del diseño de **Casa Masa** en el chat MODULO CM. Ver
`docs/CASA_MASA.md`: pedidos y empaque propios, CM-001 a CM-004 con meta diaria
de 20 unidades por SKU, sin OP originadas por pedidos; cobro electrónico contra
entrega, evidencia por WhatsApp, verificación de pago y bandeja para facturar.
Base de código revisada: `07c2f36`. Sólo diseño documentado; no se crearon pantallas,
SQL ni conexión de WhatsApp. Pendientes implementación, instalación y publicación.
Iván confirma que todavía no tienen número de WhatsApp; responsables y medios
receptores por definir. El registro manual puede desarrollarse antes. No asumir
que recibir una captura confirma un pago o que la meta diaria crea inventario.

Simulador de costos dentro de Fórmulas, 19/11/2026. Se trasladó la entrada de Simulador de costos desde las pestañas de Resultados y rentabilidad a una tarjeta dentro de Producción → Fórmulas. Reutiliza SimuladorCostosCotizacion y sus consultas/cálculos, con Volver a Fórmulas. Cambios de frontend en Formulas.tsx y CostosIndirectos.tsx. Pasó npm run build con el Supabase operativo. Publicado desde `f7a9548`, despliegue `e53ea38d`. El dominio público sirve ambos módulos idénticos al build y se verificaron la tarjeta nueva, retirada de la pestaña anterior, Supabase operativo y R2/firma. Cambio de frontend sin SQL.

Editar fórmula con lista completa de ingredientes, 19/11/2026. Preparado sobre `9b0b052`. Formulación incluye Editar fórmula, con selección de materias primas desde el catálogo, Agregar ingrediente, Quitar, harina base, Directo/Micro y porcentajes. Permite completar una fórmula guardada con ingredientes faltantes. Conserva datos de parada y guardado de nueva versión de fórmula/micro. El servicio distingue filas nuevas y envía la estructura completa al RPC.

La migración pendiente `202611190001_edicion_ingredientes_formula.sql` amplía fm_guardar_formulacion conservando el contrato de los clientes anteriores y sus reintentos. Admite filas nuevas, sustituidas y retiradas solo en la nueva versión. Verifica pertenencia de IDs al origen, materias activas/unidad/costo para ingredientes nuevos, harinas base y duplicados nuevos. Las separaciones de un mismo ingrediente ya existentes en recetas anteriores pueden conservarse. La prueba de dos ingredientes faltantes produce cuatro filas y un micro de tres ingredientes, dejando las filas anteriores intactas.

Verificación local: 31 pruebas SQL/cliente aprobadas, incluidas altas, versionado, edición/agregado/retiro, reintento, costeo y reversión completa ante errores. Build TypeScript/Vite/PWA correcto con el Supabase operativo.

Publicado el 19/11/2026 desde `d2de736`, despliegue `b61b9f62`. Se instaló y registró únicamente `202611190001` en `eodcwkuexldsbomflthe`. Se verificaron edición completa, permisos y conservación de los conteos previos de 18 fórmulas y 19 versiones. El dominio público sirve el módulo idéntico al build con Editar fórmula, Agregar ingrediente y el envío de estructura completa. Supabase operativo y R2/firma verificados. La corrección real de CM-002 queda pendiente de que Iván complete los ingredientes y confirme la nueva versión en la app.

Edición completa de ingredientes en Formulación, 19/11/2026. Preparada sobre `9b0b052` por la fórmula guardada con dos ingredientes faltantes reportada por Iván. La pantalla incorpora Editar fórmula y los controles de selección de materia prima del catálogo, Agregar ingrediente, Quitar, harina base, porcentaje panadero y destino Directo/Micro. Conserva los datos de parada y el guardado como una nueva versión con su micro asociado.

La migración nueva `202611190001_edicion_ingredientes_formula.sql` amplía fm_guardar_formulacion para recibir una lista completa de ingredientes. Permite agregar, sustituir y retirar líneas, valida artículos/precios/unidades de las nuevas materias y la base de harina y guarda la nueva estructura en una transacción. Las solicitudes de clientes anteriores mantienen su formato por IDs y su recuperación. El contenido de las versiones de origen conserva sus filas. Pruebas SQL con metadatos reales comprobaron el caso de agregar dos ingredientes a una fórmula de dos filas, cálculo del micro, costeo, cambios y retiros posteriores, reintentos y rollback por duplicados o costo ausente. Pendiente aprobación, instalación/registro solo de esa migración y publicación. La fórmula real mostrada por Iván queda pendiente de que él complete los ingredientes en la app.

Destino Directo/Micro y peso de bola versionado, 18/11/2026. Corrección preparada sobre `3d939b4` por indicación de Iván. Ingresar nuevo producto muestra únicamente Directo y Micro en Destino. Los ingredientes Micro generan un micro calculado llamado MICRO + nombre corto; la composición y el peso por parada se obtienen de sus porcentajes. El alta incluye Peso de bola (g), y Peso de la parada (kg) se calcula con panes × gramos / 1000. Formulación permite editar unidades por parada, peso de bola, peso final, rendimiento y destino de cada ingrediente, además del porcentaje. Guarda una nueva versión.

La migración pendiente `202611180006_formulacion_parada_micro.sql` conserva el RPC y los comprobantes de altas anteriores. Las altas nuevas envían peso de bola y destino; SQL calcula y valida el peso y crea el micro asociado automáticamente. Las versiones del micro se identifican por su formula_version_id y numero_version en las vistas FM existentes. Un nuevo RPC de formulación copia los datos a una versión independiente y activa al final dentro de una transacción. Porcentajes, destinos y parámetros de las versiones anteriores conservan su contenido; la activación actualiza sus estados de vigencia. La versión vigente nueva comienza hoy, con fecha America/Bogota, y pueden prepararse borradores para una fecha posterior. El catálogo de producto y los documentos anteriores son objetos separados de estos parámetros versionados.

El navegador conserva por usuario/proyecto el UUID y los datos del guardado antes del envío. Reintentar una respuesta perdida recupera la misma versión. Se verifica si el origen cambió, el bloqueo de la fórmula, actor y permisos. Verificación local: 27 pruebas SQL/cliente sobre metadatos reales de FM, incluidos micro automático, 20×580=11,6 kg, nueva parada 40×580=23,2 kg, ediciones de destino y bola solo en versión nueva, composición de micro, datos de origen conservados, reintento y rechazo de retrofecha. Build TypeScript/Vite/PWA correcto con el Supabase operativo.

Publicado el 18/11/2026 desde `06caa78`, despliegue `7ab4cd45`. Se instaló y registró únicamente `202611180006` en `eodcwkuexldsbomflthe`. Se verificaron permisos autenticados, bloqueo anónimo, helper y comprobantes privados, y habilitación del peso de bola y micro automático. La instalación mantuvo los conteos previos de 16 fórmulas, 17 versiones y 12 micros, con cero asociaciones/guardados nuevos. El dominio público sirve el módulo idéntico al build con los campos de bola/parada, destino y RPC de versionado. Supabase operativo y R2/firma verificados. Pendiente la primera operación real del propietario.

Administración de fórmulas como tarjeta, 18/11/2026. Preparada sobre `af71628` de main. Fórmulas incorpora Administrar catálogo y versiones, con listado paginado completo de fórmulas activas/bloqueadas, búsqueda y listado de versiones. Se trasladó el acceso de administración desde Formulación a esta tarjeta. El editor previo de ingredientes, micros y versiones sigue accesible desde el catálogo. Las acciones de administración requieren permisos de Administración, y la pantalla confirma el objeto concreto antes de bloquear o eliminar.

La migración pendiente `202611180005_administracion_formulas.sql` agrega comprobantes privados por solicitud/actor/acción/objeto y un RPC transaccional. Bloquear cambia fm_formulas.activo a false. Las vistas FM de recetas/costos que exponen formula_id filtran el estado activo, incluidos impresión y micros. Desbloquear recupera el uso con sus versiones anteriores. Eliminar versión admite también una vigente ingresada por error; retira sus ingredientes en la misma transacción y puede dejar pendiente el costeo hasta establecer otra vigente. Eliminar fórmula retira versiones, ingredientes y vínculos de fórmula a productos. Las referencias externas que impidan un borrado revierten toda la operación. El SKU y los documentos de negocio son objetos separados de la fórmula y se conservan. Los reintentos del alta anterior detectan una fórmula eliminada.

Verificación local: 12 pruebas SQL con los esquemas y vistas reales exportados de la base activa (solo metadatos en supabase/.temp/alta-producto-esquema.json) y ocho pruebas existentes de formulación. Comprobados bloqueo/desbloqueo de nueve vistas, recuperación de costo, eliminación vigente, rollback por referencia externa, idempotencia, actor y permisos. Pasó npm run build con el Supabase operativo.

Publicado el 18/11/2026 desde `78b45e6`, despliegue `abb18a2b`. Se aplicó y registró únicamente `202611180005` en `eodcwkuexldsbomflthe`. La verificación confirmó nueve vistas actualizadas, permisos autenticados de la función, bloqueo anónimo y comprobantes privados. El catálogo conservó 17 fórmulas y 18 versiones, con cero acciones administrativas al instalar. El dominio público sirve el módulo y los estilos idénticos al build, incluidos tarjeta, listado y controles de bloqueo/desbloqueo/eliminación. Supabase operativo y R2/firma verificados. La operación real del propietario queda pendiente.

Alta conjunta de producto y fórmula maestra, 18/11/2026. Preparada sobre `5cfa43a` de main. Fórmulas tiene una tarjeta Ingresar nuevo producto. Incluye datos del SKU, vida útil, unidades de pan y unidades vendibles por parada, peso de la parada y peso final, selección de ingredientes con porcentaje panadero/harina base/destino directo o micro y empaques por unidad vendible. Usa artículos de receta en KG, conforme al cálculo por peso existente. Las harinas base deben sumar 100%. El costo central de materiales incluye ingredientes y empaques; MOD/CIF y otros rubros mantienen sus consultas en el simulador.

La migración nueva `202611180004_alta_producto_formula.sql` agrega un RPC que crea producto, fórmula, primera versión vigente, ingredientes, empaques y vínculo fm_formula_productos en una sola transacción. Reutiliza fm_activar_version y fm_vw_productos_costo_completo. El simulador, dashboard, informes de costos y rentabilidad siguen consultando esa misma vista. Rechaza costos faltantes de artículos incluidos en costeo, cantidades inválidas, códigos existentes y mezcla de unidades incompatibles. Un comprobante privado por UUID/actor/datos permite recuperar respuestas perdidas. El navegador conserva el intento antes de enviarlo y permite corregir después de un rechazo SQL confirmado. El alta exige los permisos vigentes de Administración y de escritura de fórmulas.

Verificación local: siete pruebas SQL con esquema y vistas exportados de la base activa (solo metadatos, guardados fuera de Git en supabase/.temp/alta-producto-esquema.json) y ocho pruebas existentes de formulación. Verifican costo unitario del rendimiento con empaque, vínculo vigente, actualización central al cambiar el precio de una MP, reversión completa, reintentos, actor, permisos y validaciones. Pasó npm run build con el Supabase operativo.

Publicado el 18/11/2026 desde `a7ba283`, despliegue `966916e2`. Se instaló y registró únicamente `202611180004` en `eodcwkuexldsbomflthe`. La consulta confirmó función autenticada sin acceso anónimo, RLS y comprobantes privados, y cero altas antes de publicar. El dominio público sirve la tarjeta, el formulario, el RPC cliente y los estilos idénticos al build. Se verificaron Supabase operativo y R2/firma. Pendiente primera alta real del propietario. El despliegue no creó productos ni fórmulas reales.

Fórmulas en dos tarjetas, 18/11/2026. Formulación muestra filtros de SKU y versión, elige la última vigente y presenta una tabla con solo el porcentaje panadero editable; Enter avanza entre celdas. Guarda una copia mediante fm_crear_reformulacion, actualiza únicamente porcentajes y conserva nombre y fecha de modificación en observaciones de la versión, sin SQL nuevo. La fecha predeterminada usa America/Bogota. La casilla visible permite establecer la nueva versión como vigente o conservarla como borrador. Las filas y metadatos se completan antes de activar; ante un fallo se retoma el mismo borrador conocido. La administración anterior sigue accesible desde Formulación. Impresión conserva el cálculo previo de unidades del SKU (fundas), unidades individuales y micros. La tabla y la impresión del SKU agrupan el micro sin sus ingredientes; la opción Micros sí los desglosa. Ambas tablas tienen grilla tipo Excel. Se cancelan respuestas antiguas al cambiar los filtros y se bloquea imprimir con cantidades inválidas. Pasaron ocho pruebas de guardado/validación/reintento/agrupación y el renderizado de solo las celdas de porcentaje editables. Pasó npm run build final con el Supabase operativo. Al guardar se refrescan también las versiones de impresión. Publicado desde `6055052`, despliegue `fe4554ef`. El índice, el módulo de Fórmulas y su CSS del dominio público coinciden con el compilado. Se verificó la configuración operativa de capturas. Las escrituras se probaron con repositorio simulado, sin modificar fórmulas reales.

Producción en tarjetas, 18/11/2026. La entrada Producción · Resumen reutiliza MenuTarjetas de Compras y Finanzas, con nueve accesos a Pedidos, Planificación, Producción, Fórmulas, Semielaborados, Etiquetado, Historial, Análisis y Hoja de producción. Semielaborados conserva su estado pendiente. Las tarjetas se filtran por permiso y la barra de pestañas se reemplaza por Volver a Producción en las pantallas internas. Las rutas de trabajo y el acceso antiguo Producción mantienen sus componentes. El menú contenedor se permite cuando existe una opción autorizada, incluyendo permisos antiguos, sin ampliar acceso a opciones hermanas. Pasaron 21 pruebas de permisos y una comprobación de renderizado de las nueve tarjetas, destinos y filtro. Pasó npm run build con el Supabase operativo. Publicado desde `dd07a95`, despliegue `0729c600`. El índice, el módulo de tarjetas de Producción y su CSS compartido del dominio público coinciden con el compilado. Backend de capturas operativo verificado.

Campo de paradas por batch, 18/11/2026. Se retiró del formulario Crear nueva versión en Preformulación por indicación de Iván. Cada versión creada desde ese formulario usa una parada por batch. Publicado desde `7ece65b`, despliegue `6ed77f40`. Pasó npm run build con el Supabase operativo. El dominio público sirve el módulo de Fórmulas idéntico al build, con el campo retirado y el valor automático uno. Se verificaron Supabase operativo y R2/firma. Cambio de frontend.

Autollenado de recepción de MP, 18/11/2026. La fecha se inicia con la fecha de la factura, incluida su edición visible. El detalle reconoce nombres únicos del catálogo y completa las cantidades cuando la unidad del XML o el peso de la presentación permiten convertirlas; muestra la explicación y permite corregir la propuesta antes de confirmar. Por ejemplo, cantidad 1 de LECHE EN POLVO INDUSTRIAL 25 KILOS propone Leche en polvo y 25 KG. Los KG ya declarados por el XML no vuelven a multiplicarse por el peso del saco. Las fundas conservan unidades aunque su nombre indique el peso del pan. Las coincidencias ambiguas, las conversiones sin respaldo y los documentos del Excel sin cantidad física quedan pendientes de completar. Se relee el XML original al abrir el detalle para recuperar unidades que las facturas antiguas no conservaban en datos. El importador también conserva la unidad cuando está en unidadMedida o en detalles adicionales. No hay SQL nuevo ni carga automática de existencias. Pasaron 12 pruebas de reconocimiento y recepción, Chrome con autollenado de fecha/artículo/25 KG, lectura de unidad del XML, reintento idempotente y vista a 390 px. Pasó npm run build con el Supabase operativo. Publicado desde `e90c4ab`, despliegue `b9fa8385`. El índice y el módulo y estilo de Compras del dominio público coinciden por SHA-256 con el build; Supabase operativo y R2/firma verificados. Se incorporó antes la actualización de Preformulación de main. No se registraron recepciones reales por esta corrección.

Ícono turquesa de instalación, 18/11/2026. Se incorporó literalmente el archivo Icono CIBUSPAN ONE en Turquesa.png como public/cibuspan-one-app-icon-turquesa.png, SHA-256 EDF79E547EF78EAAD9E0FB50DD305B6FE279663EEDDF9F03F8467AA594A99944. Se derivaron únicamente tamaños proporcionales 32, 180, 192 y 512. Favicon, apple-touch-icon, manifiesto PWA y ayuda de instalación usan las nuevas rutas. Se mantiene la URL del manifiesto y la identidad de instalación. Se conservan los logos oficiales anteriores. Revisado visualmente el tamaño 192. Los navegadores gestionan la actualización del ícono de instalaciones existentes; Chrome puede requerir aceptar Review app update. Referencia https://developer.chrome.com/blog/improvements-to-web-app-updates. Pasó npm run build y se verificaron las dimensiones reales de los PNG y las referencias del manifiesto y HTML compilados. Publicado desde `902b8a9`, despliegue `59aa4957`. Coincidieron los SHA-256 públicos de las cinco imágenes y el contenido del manifiesto; el índice público referencia los nuevos favicon y apple-touch-icon. No se comprobó el cambio del acceso instalado en dispositivos del usuario.

Recepción de compras a Kardex de MP, 18/11/2026. Preparado sobre `fc15cf8` de main. En Facturas SRI → Detalle se puede relacionar cada línea con una materia prima o empaque activo, completar la cantidad en la unidad de catálogo y confirmar la fecha de recepción física. Los conceptos sin artículo seleccionado no generan movimientos. Se registra una recepción completa por factura; las entregas parciales no están incluidas en este cambio. Para las facturas del Excel, las cantidades físicas deben completarse con el documento o la recepción de bodega, porque el archivo anual no las contiene. No se procesan automáticamente compras históricas ni pagos y no se deducen cantidades del importe. No confirmar compras ya incorporadas en una toma física posterior a su recepción.

La nueva migración `202611180003_compras_recepcion_mp.sql` conserva la factura y las líneas de origen, el artículo, la unidad y los IDs de movimientos. Reutiliza `inv_kardex_registrar`, sus permisos, los saldos iniciales y las protecciones de fecha de MP; cada entrada lleva referencia a su factura. La confirmación es atómica e idempotente por documento; XML y Excel vinculados comparten la misma recepción. Se rechaza una factura modificada desde la revisión. El formulario conserva el UUID y el contenido para verificar/reintentar una respuesta incierta. Las tablas de facturas y sus acciones de pago se conservan.

Verificación local: 18 pruebas SQL aprobadas de recepción, compras del Excel y Kardex, incluidas reversión de todas las líneas al fallar una, reintentos, permisos, cantidades, fechas y conservación de XML y pagos. Chrome con datos simulados confirmó el formulario dentro del detalle real, el reintento tras HTTP 503 con contenido idéntico, la recepción persistente y la ausencia de desbordamiento de página a 390 px. Pasó `npm run build` con el Supabase operativo.

Publicado el 18/11/2026 desde `069c01e`, despliegue `31ea9239`, después de incorporar la última publicación del ícono turquesa de main. Se aplicó y registró únicamente `202611180003` en el Supabase operativo. La comprobación de solo lectura confirmó acceso administrativo a los estados de facturas XML y Excel, permisos de las funciones y tabla, cero recepciones y conservación exacta de los 48 movimientos anteriores y de la función existente del Kardex. El dominio público sirve el índice y el módulo y estilo de Compras con SHA-256 idénticos al build. Se verificaron el Supabase operativo, el bloqueo anónimo HTTP 401 y R2/firma. No se registró ninguna recepción real ni se modificaron existencias por esta publicación. El primer ingreso físico queda a cargo del personal autorizado al confirmar cantidades y fecha reales.

Regreso de Roles de pago, 18/11/2026. El botón Volver a Roles de pago se muestra en la barra superior junto a Volver a Pagos y Finanzas, con la misma clase y dimensiones. Aparece al abrir las cuatro opciones y vuelve al menú de tarjetas; se retiró la franja interior. Se comparte el estado de vista entre App y RolesPago y se reinicia al cambiar de pantalla. El regreso a Finanzas conserva su permiso. El renderizado de Layout confirmó ambos botones en las dos rutas compatibles. Pasó npm run build. Publicado desde `92031d4`, despliegue `0ad14876`. El índice público y los módulos de entrada y Roles de pago coinciden con el compilado.

Destino de Pagos nómina, 18/11/2026. El botón carga las obligaciones a Cuentas por pagar y abre esa pantalla. La semana y el monto que se pagará se escogen después en la tabla de Cuentas por pagar. La nueva función `fin_cargar_nomina_cuentas` conserva la validación y el control de duplicados; la entrada anterior también usa este destino. Chrome con datos simulados y dos pruebas SQL confirmaron que la carga crea obligaciones y que solo una selección posterior genera la programación semanal. Se instaló y registró únicamente `202611180002_nomina_cuentas_por_pagar.sql` y se verificaron sus funciones y permisos por lectura. Pasó npm run build. Publicado desde `a22765b`, despliegue `965283e9`. Coincidieron los SHA-256 públicos del índice, los módulos de Finanzas y Roles, sus estilos y el repositorio de nómina. Se comprobó Supabase/R2/firma.

Roles de pago y Pagos nómina, 18/11/2026. El menú tiene cuatro tarjetas: Cargar PDF, Resumen mensual, Empleados y áreas y Pagos nómina. El maestro permite crear y editar personal, área, estado Activo/Desvinculado y vínculo Nómina/Prestador externo. Pagos nómina muestra activos de ambos vínculos en una cuadrícula compacta, con selección de mes, concepto y semana. Primera quincena inicia en USD 300 editables por persona y las otras opciones en blanco. Se incluyó literalmente Décimo sexto sueldo conforme al pedido. La carga genera obligaciones por persona, mes y concepto y usa el circuito compartido de Pagos semanales. Una carga repetida no duplica la obligación. La importación de roles históricos conserva el estado y el vínculo del maestro. Pasaron cuatro pruebas SQL y el flujo de Chrome con datos simulados. Se instaló y registró únicamente `202611180001_nomina_programacion_personal.sql`. Publicado desde `b8fbe80`, despliegue `d848a768`. La consulta operativa de solo lectura encontró 15 personas activas, inicialmente clasificadas como Nómina; corresponde al propietario ajustar vínculos y estados y agregar externos. Se confirmó cero obligaciones de nómina al instalar, conservación de las compras y bloqueo anónimo. Coincidieron los SHA-256 del índice, los módulos y estilos de Roles y Finanzas y el repositorio de nómina públicos. Supabase/R2/firma comprobados. El primer pago real queda pendiente del usuario.

Formulario de pagos, 18/11/2026. Al rechazar el servidor una operación con HTTP 4xx, los campos vuelven a habilitarse para corregir el monto, la fecha o la referencia. Ante una respuesta incierta se conserva la solicitud con su UUID para reintentar. El diálogo se monta en el cuerpo del documento y sincroniza Escape, Cancelar y el cierre nativo con el estado del formulario. Publicado desde `dd8431a`, despliegue `fde704ff`. Pasó npm run build. En Chrome con datos simulados se comprobaron importe fuera de rango, cierre por Escape y por API nativa, corrección de referencia después de rechazo HTTP 400 y reintento con el mismo UUID después de HTTP 503, con un solo pago simulado. Coincidieron los SHA-256 del índice, ambos módulos de Finanzas y su CSS en el dominio público, y se comprobó Supabase/R2/firma. Cambio de frontend sin SQL nuevo.

Identidad visual de módulos, 17/11/2026. Se reemplazaron los colores de marca vino y naranja que seguían en títulos, botones, pestañas y gráficos de pantallas internas por azul profundo y turquesa oscuro legible. En Facturas y pagos se unificaron además los fondos, bordes y textos secundarios, se destacó la pestaña activa en azul y se aumentaron las etiquetas pequeñas. Revisión automatizada del diff confirmó solo sustituciones de colores en 56 archivos y cambios de presentación en PagosGastos.tsx. Pasó npm run build con el Supabase operativo. Publicado desde `c933aec`, despliegue `5c0c72a2`. Se verificó que el índice y los módulos públicos de Facturas y pagos, Usuarios y permisos y Producción coinciden con el compilado, y que capturas usa el Supabase operativo. Pendiente comprobación visual con sesión del usuario.

Corrección de instalación, 17/11/2026. Chrome reportó `manifest-missing-suitable-icon` en producción. Se generaron tamaños de 192 y 512 píxeles desde el PNG oficial, conservando el archivo original, y se referenciaron en el manifiesto. El botón principal invoca directamente el prompt nativo cuando está disponible. Pasó `npm run build`. Publicado desde `557ef87`, despliegue `b95bf069`. Se comprobó en sesiones aisladas de Chrome, local y dominio público, que `Page.getInstallabilityErrors` devuelve una lista vacía y que el botón de instalación nativa aparece antes del login. El usuario confirma la instalación desde el navegador.

Instalación de la app, 17/11/2026. El control de instalación se monta desde la entrada principal antes del inicio de sesión. El botón abre la instalación nativa cuando el navegador la ofrece y muestra pasos para iOS, Android o escritorio cuando corresponde. El enlace `https://cibuspan-one.pages.dev/?instalar=1` abre directamente la ayuda. La app instalada oculta el botón. Pasó `npm run build` y la comprobación de prompt nativo, instrucciones iOS/Android y ocultación tras instalar. Publicado desde `54c44db`, despliegue `71bbffe6`. Se verificaron el enlace público, el código, los estilos y el ícono oficial.

Permisos por submenú, 17/11/2026. El editor de usuarios muestra módulos desplegables y opciones anidadas con casillas y selección parcial. El catálogo de rutas se comparte con admin-users. Los permisos exactos prevalecen sobre los permisos anteriores de categoría y sus aliases. La sesión conserva también las denegaciones para impedir que un permiso general reabra una opción desactivada. Los menús contenedores se pueden abrir cuando hay una opción hija autorizada. Las restricciones existentes por rol de Usuarios y permisos, Facturas SRI y Pagos semanales aparecen identificadas en el editor. Se conserva el acceso previo hasta guardar la nueva selección. Pasaron 20 pruebas y `npm run build`. Función admin-users desplegada y frontend publicado desde `c812e53`, despliegue `a06f5d01`. Verificados el código y los estilos públicos y la validación de sesión de la función. Cambio de frontend y función, sin SQL nuevo.

Usuarios y permisos, 17/11/2026. Se comprobó que el Supabase operativo conserva seis usuarios de Auth, seis perfiles, 74 permisos y 46 registros de auditoría. Faltaba la función `admin-users` y fue desplegada desde el código existente. La función valida la sesión con `auth.getUser` y exige perfil activo ADMINISTRADOR. El cliente ahora conserva el error original cuando el contexto no es Response y lee el error JSON cuando está disponible. Pasaron 16 pruebas de permisos y `npm run build`. Publicado desde `0ea5ce0`, despliegue `943c183a`. Se confirmó el frontend público y que la función activa responde 401 sin sesión. Pendiente comprobar el listado visual con una sesión administradora.

Carga anual de Compras, 17/11/2026. Fuente revisada: `pagos para cibuspan one.xlsx`, hoja Hoja1, SHA-256 `b1fc6ea943962a98948c5692e9ed5954c67eed2ed7941052724c8c8708d0c68a`. El usuario confirmó solo compras de 2026 y reunir abonos y pendientes por factura. El plan contiene 746 documentos (689 facturas, 46 notas de venta y 11 sin factura), con 27 repeticiones exactas conservadas como referencias sin sumar su pago otra vez. Ocho facturas se vinculan al XML existente. Las filas azules aportan pagos y el resto saldo pendiente. Para FACT 97 de Cumbal se conservan 800 pagados y 550 pendientes del Excel. Cinco netos y 49 fechas de emisión quedan pendientes de completar. Cada documento conserva las filas originales. El ensayo PostgreSQL de la carga y el reintento y la prueba de Chrome pasaron. La migración `202611170004_compras_excel_anual.sql` y los 746 documentos se aplicaron juntos en una transacción y se verificaron en el Supabase operativo. Se registró únicamente esta versión nueva.

Publicado desde `9c7f21e` el 17/11/2026, despliegue `b968102e`. La consulta real confirmó 629 documentos pagados, 112 con saldo conocido y 5 con neto pendiente. Los 12 XML anteriores quedaron intactos; ocho se vinculan al Excel y no se presentan duplicados. Se verificaron por SHA-256 el índice y los módulos de Compras y Finanzas públicos, además del bloqueo anónimo HTTP 401 y de Supabase/R2/firma. El Excel de origen se conservó. El respaldo, el plan, las filas excluidas y el SQL de carga están en `diagnosticos_privados/importacion_excel_20261117/`, ignorados por Git. Pendientes de completar los 5 netos y las 49 fechas con información del propietario.

Gastos no deducibles de Compras, 17/11/2026. La tarjeta consulta directamente los documentos manuales de tipo `NO_DEDUCIBLE` en la tabla de Compras. Si no se ha ingresado ninguno, muestra la tabla vacía. Pasó `npm run build` y en Chrome con datos simulados se comprobó que la tarjeta no consulta el histórico contable y que muestra el gasto ingresado con el botón «Detalle». Publicado desde `7891f10` en `main`, despliegue `481e105c`. Se verificaron por SHA-256 el índice y el módulo de documentos en el dominio público, así como la configuración del Supabase operativo y de capturas. Cambio de frontend sin SQL nuevo.

Cuentas por pagar, 17/11/2026. La primera tabla limita el área visible a diez filas de documentos y fija la cabecera. Al acercarse al final de la barra vertical, consulta más registros con los filtros activos. La selección se conserva al desplazarse. En Chrome se veían diez filas completas en escritorio y móvil y se llegó al último de 54 documentos simulados. Pasó `npm run build`. Publicado desde `c5a2179` en `main`, despliegue `a8a3efda`. Los SHA-256 del índice, ambos módulos de Finanzas y su hoja de estilos coinciden en producción. Se comprobó el Supabase operativo, R2 y firma. Cambio de frontend sin SQL nuevo.

Pagos y Finanzas en tarjetas, 17/11/2026. Cuentas por pagar reúne Facturas SRI, Notas de venta y Gastos no deducibles en una grilla compacta. Las casillas alimentan la tabla inferior, donde se revisan los montos antes de guardar la semana y abrir Pagos semanales. Se pueden registrar pagos y abonos con fecha y referencia. Cada documento conserva su saldo y los abonos SRI se registran con la función existente. El plan compartido y los pagos requieren un administrador activo, igual que la bandeja SRI. Los históricos de Clasificación de gastos requieren verificar el saldo. El registro anterior de facturas, pagos e importaciones Excel sigue accesible desde su tarjeta. Las acciones registran pagos efectuados.

Publicado el 17/11/2026 desde `697c8c5` en `main`, despliegue `17879220`. Se aplicó y registró únicamente la migración `202611170003_fin_cuentas_por_pagar_compras.sql` en el Supabase operativo. Una consulta de solo lectura como administrador devolvió 12 facturas SRI y 42 gastos no deducibles. Compras aún tenía cero notas de venta. Se comprobó la restricción de lectura y ejecución para el rol anónimo. Pasaron el build con el Supabase operativo, las pruebas de PostgreSQL local y el flujo de Chrome con datos simulados. En el dominio público coincidieron los SHA-256 del índice, los módulos de Finanzas y su hoja de estilos, y se confirmó la configuración de Supabase, R2 y firma. El primer pago de producción queda a cargo del usuario.

Facturas SRI solo con Detalle, 17/11/2026. Se retiran los botones Abonar y Pagar, y su formulario, también de la tabla de Facturas SRI. La última columna se llama «Detalle». Los pagos y abonos históricos y sus saldos se siguen mostrando. Se conserva el filtro de proveedor. En Chrome con datos simulados se verificaron Detalle, el historial, el filtro y la paginación.

La corrección se publicó el 17/11/2026 desde `77758e1` en `main`, despliegue `e8f37efc`. Pasó `npm run build` con el Supabase operativo, y se verificó en el dominio público el módulo SRI sin las acciones de pago, su hoja de estilos y la configuración de R2 y firma. Cambio de frontend sin SQL nuevo.

Filtro de proveedor en Facturas SRI, 17/11/2026. La cabecera «Proveedor» abre una búsqueda por primeras letras sin distinguir mayúsculas ni tildes. Al elegir una opción se filtra por el nombre exacto que muestra la factura, teniendo en cuenta las ediciones, y la paginación se aplica al resultado completo. Se puede quitar el filtro. La migración `202611170002_compras_sri_filtro_proveedor.sql` añade dos consultas de lectura y un índice conservando los permisos del SRI. Pasaron `npm run build`, las pruebas SQL del filtro y de alta manual, y la prueba en Chrome con Supabase simulado de selección, paginación, nombres editados y móvil.

Ingreso manual y filtro de proveedor publicados el 17/11/2026 desde `ae983fb` en `main`, despliegue `3d47114e`. Las migraciones `202611170001` y `202611170002` se aplicaron y registraron en el Supabase operativo. En una transacción de solo lectura se verificaron ambos tipos de documento, la búsqueda, el filtro exacto y el bloqueo de sesiones sin permisos. La API respondió HTTP 401 a las consultas anónimas. Pasó `npm run build` y se verificaron por SHA-256 el índice, los dos módulos de Compras y sus estilos servidos por el dominio público.

Ingreso manual de documentos de Compras, 17/11/2026. Notas de venta y Gastos no deducibles usan la cuadrícula compacta de Facturas SRI y solo tienen «Detalle» como acción por fila. Cada sección permite ingresar sus documentos manualmente. Los registros nuevos se guardan en Compras y la vista combina las capturas con los registros históricos de Clasificación de gastos, sin crear asientos ni pagos. La migración `202611170001_compras_documentos_manuales.sql` conserva los permisos de Administración y debe aplicarse antes de publicar. Pasaron `npm run build`, 15 pruebas y la verificación de Chrome con Supabase simulado para ambas altas, reintento sin duplicado y desplazamiento móvil.

Tabla compacta del SRI, 17/11/2026. Compras → Facturas de compras → Facturas SRI usa un encabezado más pequeño y una cuadrícula editable de 12 px con filas de 27 px, encabezado fijo y columnas ajustadas por tipo de dato. Se comprobó en Chrome que las once columnas caben a 1346 px y que en móvil la tabla se desplaza dentro de su propio contenedor. Con Supabase simulado se probaron la edición, el detalle, el abono y la apertura del formulario de pago. Pasó `npm run build`.

Tabla compacta del SRI publicada el 17/11/2026 desde `8d28376` en `main`, despliegue `003a44b9`. Pasó `npm run build` con el Supabase operativo. Se verificó que el dominio público sirve el índice, el módulo SRI y su hoja de estilos con los mismos SHA-256 que la compilación local, además de la configuración de R2 y firma. Cambio de frontend sin SQL nuevo.

Facturas de compras, 16/11/2026. Se retira el logo duplicado del menú de Compras y se agrupan las opciones en una tarjeta con tres destinos. Facturas SRI abre la bandeja existente y conserva su acceso exclusivo de administrador. Notas de venta y Gastos no deducibles son consultas de los registros existentes de Clasificación de gastos, filtradas por `NOTA_VENTA` y por la cuenta `6.2.01.2.14.31`, respectivamente. Las tres vistas ofrecen regreso al submenú y a Compras. Se conserva la ruta anterior de Facturas para accesos guardados. En Chrome con Supabase simulado se verificaron la navegación, los filtros, la paginación, el reintento, los permisos y el diseño a 360 px. Pasaron 18 pruebas y `npm run build`.

Submenú de Facturas de compras publicado el 16/11/2026 desde `ba88bea` en `main`, despliegue `a09fc5a6`. Pasó `npm run build` con el Supabase operativo. Se comprobó que el dominio público sirve los archivos exactos del build, incluido el botón de regreso al submenú, y que conserva la configuración de R2 y firma. Este cambio de Compras no requiere SQL.

Funda arrobera, 16/11/2026. El usuario confirmó 7,90 USD por 100 fundas y 10 panes por funda. La migración `202611160004` se aplicó y registró en Supabase operativo. Se creó `FUNDA-ARROBERA` como código interno y se registró el costo de referencia de 0,079 USD por funda en el catálogo. Un costo histórico positivo tiene prioridad. La prueba confirmó que el registro de referencia no genera existencias y que los demás artículos conservan sus costos. Se verificó con rol autenticado que HAM-003 incorpora 0,079 USD por presentación de 10 panes y totaliza 1,35237524 USD en materiales. HAM001 incorpora 0,0079 USD por pan según su unidad de costeo actual y totaliza 0,10057448 USD en materiales. Pasó `npm run build`. El simulador obtiene los importes de la base operativa.

Margen en dólares y revisión de costeo publicados el 16/11/2026 desde `e3944d3`, despliegue `b443a5bf`. Pasó `npm run build` y se comprobó que producción sirve el módulo compilado con el Supabase operativo. Cambio de frontend sin SQL nuevo.

Menú de Compras, 16/11/2026. La entrada de Compras muestra las tarjetas de las secciones autorizadas. «Compras por anticipar» es una tarjeta independiente y consulta el Kardex al abrirse. Cada sección ofrece «Volver a Compras». El menú también está disponible para perfiles con acceso limitado a alguna sección, con los permisos previos de cada destino. Se comprobó en Chrome con Supabase simulado la apertura y el regreso desde las nueve tarjetas, la carga de avisos, el reintento, los permisos y el diseño a 360 px. Pasaron 17 pruebas y `npm run build`.

Menú de Compras publicado el 16/11/2026 desde `23caced` en `main`, despliegue de producción `d35d4c97`. Pasó `npm run build` con el Supabase operativo. En el dominio público se verificaron el botón de regreso, el SHA-256 del índice JavaScript y los dos módulos de Compras, además de la configuración de R2 y firma. Cambio de frontend sin SQL nuevo.

Revisión del simulador, 16/11/2026. La tarjeta Margen muestra ventas netas menos costo en USD y el porcentaje sobre ventas netas. El costo automático usa la fórmula vigente y excluye borradores, lo que recupera el costo de Pan Integral 600 g. Con cliente seleccionado, los gastos específicos de agosto se atribuyen por Libro Mayor y se dividen por las unidades facturadas del cliente. El flete se incorpora una vez. Verificados cuatro escenarios de cálculo y la lectura con rol autenticado. De 17 SKU activos, 15 tienen una fórmula vigente con costo de materiales calculable. Quedan sin costo automático Sanduchero Blanco 800 g y Pan Blanco 550 g de Santa María. HAM-003 se confirmó como presentación de 10 panes. HAM-003 y HAM001 usan funda arrobera de 10 panes, pendiente identificar su costo unitario o código de catálogo. La base de agosto incluye CIF operativo de 433,12 USD y excluye 1.549,73 USD de depreciaciones clasificadas fuera de EBITDA y 621,59 USD de intereses. MOD usa las 46.847 unidades históricas del mes. Hay 22.240 unidades APP en fechas que se solapan con el histórico y su conciliación queda pendiente.

Publicación del simulador de hamburguesas. La compilación pasó. Cloudflare Pages sirve el simulador actualizado desde `fdc646e`, despliegue de producción `1391d4f6`. Se comparó el módulo público con el compilado y se confirmó el Supabase operativo en el índice servido.

Simulador de costos y hamburguesas, 16/11/2026. HAM-003 (Pan de Hamburguesa Brioche) estaba en Fórmulas y faltaba en Productos. La migración `202611160003` creó la ficha con los valores predeterminados del catálogo y vinculó las fórmulas existentes a HAM-003 y HAM001. SQL aplicado y registrado en el Supabase operativo. Se comprobó el reintento en transacción revertida y la lectura autenticada de ambos SKU activos, con costos de materiales por unidad de fórmula de 1,27337524 USD y 0,09267448 USD respectivamente. El resumen muestra siete tarjetas: MP y empaque, CIF, MOD, gastos generales, gastos específicos, costo total y margen. Los gastos se desglosan según la clasificación mensual y el flete aplicado se suma una vez en gastos específicos. La prueba de renderizado confirmó los importes con flete sugerido y con flete manual de cero.

Resumen de Compras, 16/11/2026. Compras → Resumen usa el logo oficial y los permisos de las rutas existentes. Proveedores, Costos, Historial y Análisis conservan sus pantallas pendientes, identificadas en las tarjetas. La cobertura usa el saldo registrado de MP y empaques en Kardex y las salidas confirmadas de producción en los últimos 30 días completos de Ecuador. Si el arranque de MP aún no está habilitado, el saldo se identifica como referencial. En el código y las migraciones revisadas no se encontró una fuente de plazo por insumo ni de recepciones futuras confirmadas. La fecha de pedido queda pendiente y se aclaran los faltantes por artículo. Los avisos con datos completos se verificaron con cifras de prueba. En Chrome con Supabase simulado se comprobaron las ocho rutas, los permisos, los faltantes, el reintento y la navegación móvil.

Publicado el 16/11/2026 desde `420af4a` en `main`, despliegue de producción `9d02a5bd`. Pasaron `npm run build` con el Supabase operativo y las cuatro pruebas de reposición. En el dominio público se verificaron el índice y el SHA-256 del módulo compilado, además de las referencias al Supabase operativo y la configuración de R2 y firma. Cambio de frontend sin SQL nuevo.

Tomas físicas separadas, 16/11/2026. Inventario y Despachos → Kardex ofrece Toma física de PT y Toma física de MP y empaques, cada una con carga manual o desde su propio Excel, borrador, revisión, fecha y confirmación. PT usa unidades por lote y fechas reales. MP y empaques usan la unidad de catálogo por artículo. Se puede confirmar en cualquier orden; los dos cierres quedan independientes y ninguno reemplaza el saldo del otro. Semielaborados siguen en el arranque completo, disponible antes de confirmar cualquiera de las tomas individuales. El cierre de MP incluye su protección contra movimientos retroactivos y conserva el Kardex para los consumos de fabricación.

Publicado el 16/11/2026 desde `8695592`, despliegue de producción `654a0586`. Se aplicaron en orden y registraron únicamente `202611160001_arranque_producto_terminado.sql` y `202611160002_arranque_materias_primas.sql` en `eodcwkuexldsbomflthe`. Se verificaron ambos alcances, permisos y cero cortes al instalar, además de los dos botones del Kardex en el dominio público y la configuración de Supabase, R2 y firma. El build y 30 pruebas pasaron. Pendiente que el personal ingrese y confirme sus conteos reales y complete el primer circuito de fabricación y despacho.

Arranque de Producción por toma física de PT, 16/11/2026. En Inventario y Despachos → Kardex → Toma física de PT, un administrador puede preparar un conteo por SKU y lote, declarar ceros comprobados y revisar diferencias antes de confirmar el saldo inicial. Se reutiliza el corte al cierre anterior y se concilian existencias físicas y Kardex de PT en una transacción. La opción completa sigue disponible hasta confirmar un corte. El modo PT conserva los saldos de materias primas, empaques y semielaborados. La planificación por fecha, los pedidos, el registro de producción y los despachos usan los circuitos existentes.

Verificación: compilación y 29 pruebas locales, incluido un ensayo SQL de corte, reservas, vigencia de la vista previa y reintento. En una consulta de lectura al Supabase recuperado `eodcwkuexldsbomflthe` se verificaron las definiciones sobre las que se instala el cambio, la planificación por período, el registro seguro y el disparador de consumo. Al consultar, no había un corte aplicado ni reservas activas. Se detectaron permisos directos adicionales de restauración sobre tres tablas privadas del arranque y del consumo. La migración nueva revoca TRUNCATE, REFERENCES y TRIGGER a los dos roles afectados y conserva la lectura autorizada de consumos.

El empaque usado al etiquetar semielaborados todavía requiere registro en Kardex.

Vista gráfica de Revisión operativa, 16/11/2026. Resume ventas netas, margen EBITDA, costos y gastos por devengo, devoluciones y saldo de Bancos. Para períodos sin cierre usa el último mes contable cerrado al corte y muestra las fechas de comparación. La tasa de devolución usa el período operativo seleccionado. Bancos lee los dos códigos verificados en el Balance Comparativo operativo y solo muestra montos cuando están disponibles ambas cuentas del mes. Los filtros y detalles existentes se pueden desplegar. Pasó `npm run build` con el Supabase operativo. Publicado desde `541fd4c` en Cloudflare Pages, despliegue `30e8d74f`. Se verificaron el código y los estilos públicos, la consulta de Bancos con rol autenticado para agosto y septiembre y el estado de capturas. Cambio de frontend sin SQL nuevo.

Producto Terminado y eficiencia, 15/11/2026. El panel de costos por devengo separa volumen facturado y costo unitario promedio con mezcla. Producto Terminado se analiza fuera de los rankings de desviaciones y se conserva en el puente de EBITDA. El gráfico de MOD/CIF indica qué dato falta y deja huecos cuando no hay base. En septiembre se verificaron USD 946,54 de CIF y ausencia de producción y roles de pago del mes. Publicado desde `f5d8da4`, despliegue `494aefe9`. Se verificaron los módulos públicos del tablero y de Compras, Supabase operativo, R2 y firma. Pendiente cargar producción y nómina de septiembre. El ajuste del tablero no necesita SQL.

Matriz de septiembre, 15/11/2026. Las tres reglas faltantes (daños de producción, teléfonos y patentes) se aplicaron y se verificó que habilitaron el cierre. El SQL está preservado en el commit local `764c954`. Usa el mismo número de versión `202611150001` que la migración de abonos SRI de main. Pendiente reconciliar documentalmente la numeración; no reutilizar ese número ni ejecutar otra vez el SQL para publicar el tablero.

Tabla editable y abonos de Facturas del SRI, 15/11/2026. Compras → Facturas del SRI permite editar las celdas, registrar abonos y liquidar el saldo. Los pagos aparecen en azul y el saldo parcial en una fila blanca. El XML original se conserva. La migración 202611150001 se aplicó y registró en Supabase operativo. Se comprobaron las dos columnas y la restricción de las funciones para el rol anónimo. La edición y el ciclo de abono y liquidación se probaron con datos ficticios en navegador y PostgreSQL local. Pasó npm run build. El dominio público sirve el módulo y los estilos del commit 9f161ee, despliegue 622af247. La activación del agente desde Abrir SRI en Línea queda pendiente.

Facturas recibidas del SRI, 15/11/2026. La bandeja Compras → Facturas del SRI permite a administradores importar XML de facturas y vincular el RIDE en PDF por clave de acceso. La migración 202611140001 se aplicó y registró en Supabase operativo. Se confirmaron RLS, tres políticas de administrador y ausencia de acceso anónimo. Pasó npm run build y la aplicación pública sirve el módulo del commit da102bc, despliegue a826d4b9. Los archivos piloto están descargados y queda pendiente comprobar su importación con una sesión de administrador. El navegador del chat completó la consulta de prueba del SRI. Chrome iniciado por el asistente de Windows recibió el aviso Captcha incorrecta.

Orden de Visitas PDV, 14/11/2026. El gráfico y la tabla aparecen debajo de los filtros. El contexto, las tarjetas de resumen, el conteo de pendientes y el panel de capturas y recuperación quedan debajo de la tabla. Publicado en producción el 15/11/2026 desde `c708a5b`, despliegue `354903d7`. Se comprobó que el enlace público carga el dashboard compilado con el nuevo orden y que el servicio de capturas confirma Supabase de contingencia, R2 y firma.

Revisión de capturas históricas, 14/11/2026. Si todas las capturas de un registro quedaron en el proyecto anterior y no están disponibles en R2, la pantalla omite sus campos de la cola de revisión al comprobar la disponibilidad. Conserva los valores y su estado de verificación. Si hay una captura disponible se puede revisar el dato. Publicado en producción desde `5757333`, despliegue `40d7a54c`. Se comprobó que el dominio público sirve los archivos compilados de Revisión de datos y que el endpoint de capturas confirma Supabase de contingencia, R2 y firma.

Formato de Visitas PDV, 14/11/2026. La aplicación carga la hoja de estilos de visitas desde la entrada principal y los selectores parten de la raíz del tablero, que se abre directamente desde Dashboards y Campo comercial móvil. Se reforzó el contraste de las barras, las etiquetas y la leyenda de promociones y pendientes. Pasó `npm run build` con el Supabase operativo. Publicado desde `306fbb8` en Cloudflare Pages, despliegue `dfbb499f`. Se verificaron en el dominio público el CSS inicial, el código del tablero con la nueva paleta y la conexión a Supabase, R2 y firma. Cambio de frontend sin SQL nuevo.

Marca en Dashboards, 14/11/2026. El menú principal sirve como ubicación del logo oficial. El encabezado compartido de Comercial y las demás vistas de DashboardV2 muestra el título de la vista. Pasó `npm run build` con el Supabase operativo. Publicado desde `e82f7b6` en Cloudflare Pages, despliegue `95b5db87`. Se verificó el código servido en el dominio público, el logo principal y el encabezado sin duplicado.

Depuración de Dashboards, 14/11/2026. La navegación principal del módulo muestra Revisión operativa, Comercial, Visitas PDV y Costos y gastos en una sola barra. Se retiraron las tarjetas ejecutivas sin datos y se conservan los accesos a detalle de devoluciones, el panel completo de devengo y las rutas existentes. Cambio de frontend sin SQL nuevo. Pasó `npm run build` con el Supabase operativo. Publicado desde `8f73d7b` en Cloudflare Pages, despliegue `41e3a106`. Se verificaron en el dominio público los cuatro tableros, el acceso al panel de devengo y la conexión a Supabase, R2 y firma.

Revisión operativa azul, 14/11/2026. El Ejecutivo incorpora bajo los filtros las variaciones de costos operativos, tasa de devolución atribuida y facturación por cliente, con detalle desplegable y accesos a los paneles existentes. La facturación semanal usa el rango aplicado y el devengo solo se compara cuando los dos rangos cubren meses cerrados completos. Se mantienen las pestañas, filtros y el panel completo de Costos y gastos por devengo. Cambio de frontend sin SQL nuevo. Pasó `npm run build` con el Supabase operativo. Publicado desde `9fb638f` en Cloudflare Pages, despliegue `7d4899d4`. Se verificó que el dominio público sirve el código compilado con Revisión operativa y que el endpoint de capturas confirma Supabase operativo, R2 y firma.

Identidad visual oficial, 14/11/2026. Los originales aprobados están en `public/cibuspan-one-logo.png` (logo horizontal con tres barras) y `public/cibuspan-one-icon.png` (ícono con cuatro barras). Reutilizar `LogoCibuspan` en encabezados, inicio de sesión, menú, dashboards y páginas web. El favicon, el acceso directo de iOS y el manifiesto de instalación apuntan al PNG cuadrado. Mantener tipografía, colores, gráficos y proporciones de los originales y ajustar solo el tamaño de visualización. La interfaz toma como referencia el azul profundo, turquesa y blanco. Pasó `npm run build` con Supabase operativo. Publicado desde `2a72edb` en Cloudflare Pages, despliegue `478c82ef`. Se verificaron los dos PNG públicos por SHA-256, el favicon, el manifiesto, el Supabase operativo y el estado de R2 y firma. Cambio de frontend sin SQL nuevo.

Dashboard semanal de Visitas y rotación, 14/11/2026. Ahora se abre desde Dashboards. Comercial conserva el registro de visitas y el acceso a Revisión de datos. La revisión permite filtrar los pendientes por indicador y fecha. Una barra con borde rojo abre los registros pendientes de esa barra y permite ampliar la revisión a todo el indicador en el rango. Caras en percha sigue siendo un dato de ingreso manual. Publicado en producción con el código de `2b2b0fb`, despliegue `e0bc9738`. Se comprobó que el dominio público sirve los archivos compilados del menú, del dashboard y de Revisión de datos. El endpoint de capturas confirmó Supabase de contingencia, R2 y firma.

Corrección del flete al cambiar de SKU. El simulador conserva la referencia cargada si el cliente y el mes siguen siendo los mismos. Si cambia cualquiera de los dos, consulta el flete correspondiente. En el caso reportado de Favorita, agosto de 2026 tiene 529,95 USD de transporte clasificado y 19.970 unidades facturadas, equivalentes a 0,026537 USD por unidad. Se verificaron los datos con rol autenticado. Cambio de frontend, sin SQL nuevo. Pasó `npm run build` y se confirmó que el dominio público sirve el cambio de `804d082`, despliegue `8caac118`.

Precio unitario automático en el simulador. Para el cliente y SKU elegidos se precarga el campo editable con `precio_unitario` de la fecha de facturación más reciente con cantidad y precio positivos. Si en esa fecha hay varios precios, falta historial o falla la consulta, el campo permite ingresar un precio manual. Las sucursales de Tuti conservan sus precios propios y se pide seleccionar la sucursal para ese SKU. Cambio de frontend, sin SQL nuevo. Pasó `npm run build`. Publicado desde `af947f4`, despliegue `895e7475`. Se verificó el código servido en el dominio público y el precio de Pan de Centeno 500 g para El Rosado en la base operativa con rol autenticado.

Publicación de precios Tuti por sucursal. La migración `202611130003` se aplicó y registró en Supabase operativo. Se confirmaron los dos precios después de la instalación. Pasó `npm run build`. Cloudflare Pages sirve el selector y su consulta en producción desde `e9b8629`, despliegue `76de307b`. Se confirmó el proyecto Supabase en el código servido y R2 y firma en el endpoint de capturas.

Precios Tuti por sucursal, 13/11/2026. Al elegir el SKU `7868304262219T`, el simulador ofrece Manabí (1,56 USD) y Samborondón (1,60 USD) como opciones separadas del selector de cliente. Los precios por unidad sin IVA se registran en `cliente_bodega_precios` sobre las bodegas activas del catálogo y se usan al dejar vacío el precio propuesto. El transporte conserva la referencia de Tiendas Tuti del Libro Mayor. La migración `202611130003` se validó con rol autenticado en una transacción revertida.

Publicación del flete por cliente. El commit `7078062` está activo en producción, despliegue `309e2160`. Pasó `npm run build` y se confirmó que el dominio público sirve el selector de cliente y la consulta al transporte clasificado del Supabase operativo.

Flete de cotización por cliente, 13/11/2026. El simulador identifica al cliente si el producto tiene una sola asociación activa. Se puede elegir otro cliente o usar expresamente el promedio general. Para un cliente seleccionado usa su transporte atribuido en el Libro Mayor y sus unidades facturadas del mes cerrado de referencia. Si falta esa base, solicita el importe del pedido. El flete sigue editable, incluido cero. Se comprobó con rol autenticado que Tuti tiene 3.180 USD de transporte y 25.800 unidades en agosto de 2026, equivalentes a 123,26 USD para 1.000 rollos. Cambio de frontend, sin SQL nuevo.

Publicación del costeo del rollo, 13/11/2026. Cloudflare Pages publicó `9d532b0` en producción como despliegue `2c0f469d`. Pasó `npm run build` con Supabase operativo. El dominio público sirve el Simulador de costos de Pagos y Finanzas > Resultados y su consulta a `fm_vw_productos_costo_completo`. Se verificaron en Supabase con rol autenticado de administración los dos importes completos, y en el dominio público el proyecto operativo, R2 y firma. Para usar el costo automático en el simulador se elige el SKU como producto de referencia y se deja vacío el campo de materiales.

Empaque del rollo de chocolate Tuti, 13/11/2026. El SKU `7868304262219T` costea sus dos masas, una funda y 1/12 de la caja de cartón `00120` (CAJA SIN IMPRESION). La caja costaba 0,60500446 USD al verificar, con un aporte de aproximadamente 0,05042 USD por rollo. La migración `202611130002` está aplicada y registrada en Supabase operativo. La vista que consulta el Simulador de costos para cotizar devolvió 0,80297856 USD de materiales por rollo Tuti y 0,75256172 USD por rollo normal, ambos completos. La prueba transaccional confirmó que los demás productos conservaron sus costos.

Costeo del rollo de chocolate, 13/11/2026. El SKU normal `7868304262219` y el de Tuti `7868304262219T` tienen dos fórmulas vigentes y separadas para producción. La migración `202611130001` consolida sus costos en una fila por SKU en `fm_vw_productos_costo_completo`. Cada masa aporta el costo de su lote dividido por su rendimiento. El empaque se suma una vez por unidad terminada. Si falta una masa vigente con base de costeo válida, la vista señala el costo incompleto. La prueba transaccional confirmó que los demás productos conservan sus resultados. SQL aplicado y registrado en el Supabase operativo `eodcwkuexldsbomflthe`. La lectura posterior confirmó en ambos SKU 0,71506159 USD de masas y 0,03750013 USD de empaque por rollo, para un total de 0,75256172 USD de materiales al momento de la consulta. La actualización funciona en la consulta que consume la app publicada y no requiere despliegue de frontend.

Flete de cotización editable: el simulador sugiere el transporte del mes contable de referencia multiplicado por las unidades del pedido. El importe manual reemplaza el sugerido, incluido cero. El desglose muestra transporte aplicado y otros gastos por separado, y explica la cuota de mano de obra calculada sobre las unidades producidas del mes y aplicada a las unidades del pedido. No cambia el criterio mensual de costos. Publicado desde `e44cc92`, despliegue `93780a2f`. Se verificó el módulo en el dominio de producción y la configuración de Supabase, R2 y firma.

Costos automáticos para cotizar, 13/11/2026: el simulador usa el último mes cerrado con clasificación, nómina de MOD, producción y facturación disponibles. Muestra los archivos del balance que alimentan ese mes y el costo unitario estimado por rubro. MOD y CIF se reparten por unidades producidas; transporte comercial y otros gastos se reparten por unidades facturadas. El transporte se separa de los otros gastos para no duplicarlo. Precio, unidades, materiales, descuento, devoluciones y margen mínimo se pueden editar. El resultado muestra margen y límites de descuento y devolución. Cambio sin SQL nuevo. Publicado desde `f4f2fdb`, despliegue `29208d46`. Se verificó el módulo compilado en el dominio público, Supabase operativo, R2 y firma. Pendiente comprobar los importes con los datos reales del balance.

Ajustes de costos y PyG, 12/11/2026: filtro de un mes en PyG por cliente y pestaña Simulador de costos en Pagos y Finanzas > Resultados para cotizar por unidades y precio sin historial de ventas. El PyG toma el transporte atribuido del Libro Mayor cuando hay clasificación del mes, evitando sumar de nuevo las facturas de esa cuenta. Cambios de frontend sin SQL nuevo. Publicado desde `ebdad4d` en producción, despliegue `3aad5628`. El dominio público sirve los dos módulos compilados y confirma Supabase operativo, R2 y firma. Sigue pendiente comprobar el importe de Favorita de septiembre con una sesión autenticada.

Simulador de PyG por cliente, 12/11/2026: en Pagos y Finanzas > Resultados > PyG por cliente, seleccionar un cliente y aplicar un periodo para comparar la base gerencial hasta EBITDA con un escenario. Los importes editados son totales del periodo y se pueden descargar en CSV junto con la base. Los ajustes duran mientras se mantenga abierto el mismo cliente y periodo. Publicado en producción desde `eb11686`, despliegue `78b67573`. El dominio público sirve el simulador compilado y el endpoint de capturas confirma Supabase operativo, R2 y firma. Queda pendiente validar el PyG con datos reales de un cliente.

Recuperación del 11/11/2026: [estado de producción y verificaciones pendientes](docs/CONTINGENCIA_SUPABASE.md). La app pública se publicó con la base restaurada y R2. Iván confirmó que pudo entrar al enlace público y que la app funciona. La visita y su captura se comprobaron en la vista previa.

Visitas y rotación, 11/11/2026: las barras rojas y los avisos por semana señalan sólo mediciones incluidas del indicador seleccionado. Cada barra roja abre la revisión de su propio campo y semana. El ajuste de frontend del commit `77af524` ya está en producción. Se confirmó en el código servido por la app pública. Con sesión iniciada en producción, se cambió de Rotación diaria a Stock en el local y se pulsó la barra roja de Botón de Manjar 360 g de la semana del 02 al 08/11. Se abrió el campo Stock en local de una visita del 04/11. La app indicó que esa captura histórica no está disponible en R2. La prueba fue de solo lectura. Este ajuste no requiere SQL. Las publicaciones deben compilar con el Supabase operativo `eodcwkuexldsbomflthe`.

Selector de Visitas y rotación, 11/11/2026. El commit `838ebc0` deja ocho opciones, incluidas las participaciones en clase y subclase. Pasó la compilación con la configuración de contingencia y se publicó en producción desde `main` en el despliegue `7ff4fd1e`. Se comprobó que el enlace público sirve el mismo código compilado del dashboard y que el endpoint de capturas confirma Supabase de contingencia, R2 y firma.

Promociones en Visitas y rotación, 12/11/2026. Las barras marcan PROMO o PROMO PARCIAL según las promociones registradas para el cliente y SKU en la fecha de las mediciones incluidas. El gráfico, la tabla y la descarga muestran los SKU del catálogo activo. Las barras usan tonos de azul por semana y verde cuando hay descuento. El borde rojo señala mediciones pendientes. Al pasar el cursor se ve el porcentaje o el valor por unidad de las promociones que coincidieron con las mediciones. La consulta usa los permisos actuales para leer las promociones. Se pospuso el cambio del promedio hasta observar las próximas semanas con visitas regulares. Publicado en producción con el commit `80cfdec`, despliegue `b5250a06`. Se verificó que el enlace público carga el código compilado del dashboard y que el endpoint de capturas confirma Supabase de contingencia, R2 y firma.

Catálogo de Visitas y rotación, 12/11/2026. El selector incluye Caras en percha. El dashboard muestra productos activos con una asignación activa en Cliente - Producto y usa solo las mediciones que corresponden a esa asignación. Todos los clientes combina los catálogos autorizados por cliente. Publicado en producción con el commit `c86e322`, despliegue `67141b38`. El enlace público sirve el código compilado y el endpoint de capturas confirma Supabase de contingencia, R2 y firma.

Guía de trabajo para el siguiente chat. Historial iniciado el 12 de octubre de 2026; última actualización al final: 04/11/2026 (cierre y corrección de despachos). Leer primero `AGENTS.md` y comprobar los archivos y el último commit actual. Este documento explica el método; no sustituye el código ni demuestra qué versión está publicada.

## Proyecto y forma de trabajar

Iván mantiene una aplicación real en uso. Continuar sobre sus archivos actuales con cambios pequeños y comprobables. Implementar las solicitudes autorizadas, resolver los problemas y entregar el cambio completo; no limitarse a proponer un plan ni pedir confirmaciones repetidas para acciones ya solicitadas.

- Repositorio oficial: https://github.com/ivanundacarrasco75-del/cibuspan-one
- Rama oficial: `main`.
- Aplicación: https://cibuspan-one.pages.dev
- Entorno del usuario: Windows, VS Code, PowerShell, proyecto en `D:\CIBUSPAN_ONE`.
- Tecnología: React, TypeScript, Vite, Supabase/Postgres y PWA en Cloudflare Pages.
- Supabase operativo: `eodcwkuexldsbomflthe`. El proyecto original `mkntfvsbmlgobettavnu` se conserva para recuperar capturas históricas. Son identificadores, no credenciales.

El repositorio y sus archivos actuales son la fuente de verdad. Las capturas y los Excel sirven para diagnosticar y verificar datos. No reconstruir módulos desde un ZIP antiguo, sustituir la app por otra, cambiar de plataforma ni migrar a Sites. Si falta la copia local, obtener la rama oficial desde GitHub. La carpeta temporal del agente puede cambiar entre chats.

## Ciclo de implementación que ha funcionado

1. Revisar `git status --short`, `git log` y los archivos relacionados con la solicitud. Leer las instrucciones aplicables. Respetar cambios locales del usuario.
2. Diagnosticar el flujo completo: pantalla, validación, repositorio, respuesta de Supabase y permisos. Una captura con “Listo” no requiere otra conciliación; un mensaje de guardado no basta para afirmar que los datos persisten.
3. Modificar únicamente lo necesario. Mantener el diseño y las funciones existentes. Usar las páginas para la interacción, los repositorios/servicios para datos y los utilitarios para reglas reutilizables.
4. Revisar el diff y ejecutar comprobaciones pertinentes. `npm run build` debe pasar. Para reglas de inventario, importación o permisos, usar pruebas que comprueben resultados reales, errores y casos de duplicación. No ampliar pruebas sin una razón nueva ni crear pruebas que solo repitan el código.
5. Crear un commit estable y dejarlo en la rama oficial. Comunicar qué se cambió, qué se comprobó y qué falta publicar o instalar.
6. Ejecutar instalaciones y publicaciones con las sesiones disponibles, según la preferencia confirmada por Iván el 19/11/2026. No delegar comandos por rutina ni pedir copiar código. Si existe un bloqueo que requiere su intervención, explicar el bloqueo concreto; cualquier bloque PowerShell excepcional debe comprobar `$LASTEXITCODE` después de cada comando nativo.

En este chat se trabajó con una copia local del repositorio para editar y compilar, y con el conector GitHub para guardar cambios remotos. Cuando ese conector está disponible, el procedimiento es: leer el `HEAD` y su árbol, crear el árbol usando el anterior como base, crear el commit con el padre correcto y actualizar `main` sin forzar, comprobando el SHA esperado. Si la rama cambió, revisar los cambios antes de continuar. Después sincronizar la copia local sin descartar trabajo. Si se usa Git por CLI, conservar las mismas garantías.

No abrir una rama o PR por rutina en este flujo, ni publicar un nuevo proyecto paralelo. Si es necesario aislar cambios locales, hacerlo conservando `main` como destino y respetando lo que ya haya editado el usuario.

## Publicación: distinguir código de aplicación en producción

Guardar un commit en GitHub no publica automáticamente esta PWA. Habitualmente Iván publica desde su computadora; el agente no dispone de una sesión acreditada de Cloudflare o Supabase para hacerlo por él. No afirmar “publicado” solo porque el código pasó las pruebas.

Para un cambio de frontend, sin dependencias nuevas ni SQL, usar:

```powershell
& {
    Set-Location "D:\CIBUSPAN_ONE" -ErrorAction Stop

    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Falló la actualización." }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Falló la compilación." }

    npx wrangler pages deploy dist --project-name=cibuspan-one --branch=main
    if ($LASTEXITCODE -ne 0) { throw "Falló la publicación." }
}
```

Añadir `npm ci` y su comprobación cuando cambien las dependencias o el lockfile, o falten los paquetes. Después de publicar, recargar la PWA. Una vista previa de un Excel debe volver a leer el archivo para aplicar una nueva lógica de importación.

Si Git bloquea la actualización por cambios locales, diagnosticar y respaldar los archivos concretos. No usar `reset --hard`, borrar trabajo ni aplicar `npm audit fix` indiscriminadamente.

## Precaución concreta de la base de datos

El historial remoto de migraciones puede estar incompleto porque varias actualizaciones antiguas se ejecutaron manualmente. No recomendar `supabase db push` de rutina: podría intentar aplicar cambios antiguos sobre una base más avanzada. Antes de utilizarlo, revisar historial remoto y dry-run.

Cuando sea necesario instalar SQL nuevo, preparar y probar un archivo específico. Aplicar solo ese archivo con `npx supabase db query --linked --file "..."`, comprobar éxito y registrar únicamente esa nueva versión como aplicada con `supabase migration repair VERSION --status applied --linked`. No reparar versiones antiguas para hacer coincidir el historial sin verificar qué ocurrió.

No pedir ejecutar SQL si el cambio solo es de frontend. No alterar permisos, políticas RLS, funciones o vistas de otros módulos para resolver un problema distinto. Mantener las restricciones existentes y mostrar un error claro si el usuario no tiene permisos de escritura.

Un error real ya corregido: `app_profiles` utiliza `user_id`, no `id`. La migración del Kardex falló inicialmente por esa diferencia. Las pruebas SQL se ajustaron para reproducir el esquema de perfiles definido en la migración oficial de usuarios. No inventar columnas para que una prueba pase.

No versionar `.env`, contraseñas, claves, tokens ni `supabase/.temp/`. No solicitar secretos por chat ni confundir permisos del conector con acceso a la base o a Cloudflare.

## Funciones que deben preservarse

- `DashboardV2`: conservar pestañas, filtros, comparaciones y especialmente “COSTOS Y GASTOS POR DEVENGO”.
- Roles de pago: pertenece a Pagos y Finanzas; no trasladarlo al Dashboard.
- Mantener aliases de rutas y permisos de pantallas.
- Conservar los módulos operativos existentes: pedidos, producción, lotes, reservas, despachos, devoluciones y sus referencias.
- Crear catálogo e importar stock son acciones diferentes. No guardar stock o costos ficticios al crear un artículo, ni sobrescribir existencias para quitar una advertencia.
- En importaciones, conservar cantidades y unidades; no convertir blancos en cero sin indicación del usuario ni omitir filas inválidas silenciosamente.

## Trabajo activo: saldo inicial y Kardex

Iván quiere cargar inventarios al 30/09/2026 y después registrar pedidos, producciones, compras y salidas desde el 01/10/2026 para reconstruir y conciliar octubre. Una orden de pedido no prueba que el producto fue despachado. No descontar dos veces las existencias al cargar salidas históricas.

Archivo revisado: `Inventario_2026-09-30_corregido(1).xlsx`. Contiene materias primas, empaques, micros preparados y productos terminados, con cantidades en kilos y unidades. Las cantidades deben leerse del archivo vigente, no copiarse de esta guía. El nombre de la hoja es `AGOSTO`, pero el contenido y el corte corresponden a septiembre. No inferir la fecha del nombre de la hoja.

Iván confirmó en cero las cuatro cantidades antes vacías: funda ciabatta código 36, PT ciabatta códigos CB y CI y zanahoria deshidratada código 123. Luego añadió `FSM` a la funda sanduchero integral 800g SM. Los archivos adjuntos pueden necesitar recuperarse en un nuevo entorno; no asumir que una ruta temporal sigue existiendo.

Los códigos contables cortos se comparan sin ceros iniciales: `12` corresponde a `00012`. Esto ya se vincula automáticamente cuando la coincidencia es única. Conservar completos los códigos de barras y sufijos como `7868304262219T`. Si hay varias coincidencias, no adivinar ni crear un duplicado.

El Excel no contiene los lotes ni fechas de producción reales del PT. Iván autorizó usar el 30/09/2026 como producción estimada de referencia para este saldo y calcular vencimientos con la vida útil que tiene cada SKU en el catálogo. Se generan lotes `INICIAL-EST-...`; no presentarlos como lotes físicos comprobados. El cálculo es fecha de producción más vida útil del SKU, no 30 días para todos. Los campos siguen siendo editables; no inventar días si faltan en el catálogo.

Iván afirma que esas unidades iniciales ya salieron de bodega. Esto no aporta todavía fechas ni documentos de cada salida. No darlas de baja automáticamente ni tratarlas como stock disponible definitivo hoy: hay que reconstruir los movimientos reales y verificar qué información ya existe.

### Estado de código al elaborar esta guía

- `5ca7e4b`: Kardex y carga conjunta de saldos; SQL `supabase/migrations/202610060001_kardex_inventarios.sql`.
- `be7fac3`: corrección a `app_profiles.user_id` y pruebas del esquema de perfiles.
- `d3094e4`: lectura del Excel de septiembre, ceros iniciales, unidades y residuos numéricos de fórmulas.
- `289e47f`: lotes y vencimientos automáticos. Iván confirmó que aparecieron estos cambios en su app.
- `e5df3e2`: crear y vincular artículos faltantes desde la vista previa; activar un existente inactivo solo si el usuario lo confirma; mostrar solo pendientes; detectar filas repetidas. Pasaron 18 pruebas y la compilación. Se entregó el bloque de publicación, pero aún no se recibió confirmación de esa publicación.

Los dos últimos cambios son de frontend y no requieren SQL nuevo. El `HEAD` puede avanzar: leerlo antes de continuar.

Archivos principales actuales:

- `src/pages/KardexInventario.tsx`
- `src/repositories/kardexRepository.ts`
- `src/utils/inventarioInicialExcel.ts`
- `src/components/inventario/CrearArticuloInventario.tsx`
- `src/repositories/altaArticuloInventarioRepository.ts`
- `src/utils/altaArticuloInventario.ts`
- `pruebas/verificar_kardex.mjs`, `pruebas/verificar_alta_inventario.mjs` y `pruebas/verificar_kardex_sql.mjs`

Comprobación de las reglas de frontend:

```bash
node --experimental-strip-types --test pruebas/verificar_kardex.mjs pruebas/verificar_alta_inventario.mjs
npm run build
```

Las pruebas SQL utilizan PGlite y requieren la dependencia indicada en su archivo de prueba. No depender de la ruta temporal usada en otro chat.

### Inicio de octubre autorizado el 07/10/2026

Iván indicó que este chat es exclusivamente de programación de CIBUSPAN ONE y pidió programar el inicio desde octubre. La solicitud intercalada de ASAMA fue un error y debe ignorarse.

Se agregó `supabase/migrations/202610070001_inicio_octubre.sql` y la opción “Empezar desde octubre” en Kardex > Cargar saldo inicial. El SQL solo instala la opción: no reinicia el inventario al ejecutarse. Iván confirmó después de la corrección de omisiones: “LISTO YA TENEMOS EL INICIO”. El saldo inicial se considera completado según su confirmación; el agente no lo verificó mediante una consulta directa a la base. No pedir repetir el reinicio ni volver a cargar el saldo inicial.

La confirmación guarda un respaldo completo de lotes, movimientos, cargas y catálogos en `inv_respaldos_inicio`, conserva IDs de los lotes anteriores, los marca con `inv_archivo_id`, deja su cantidad en cero y los excluye de la selección activa. Se sustituyen los movimientos y cargas activas por el Excel, dentro de la misma transacción. No borra pedidos, despachos ni recetas. Si aparece cualquier error de carga se revierte toda la operación. Los lotes archivados no se pueden reactivar ni borrar desde la app. Si una referencia inicial colisiona con un lote anterior, la nueva recibe un sufijo INICIO y el original queda respaldado.

Es un inicio único al 30/09/2026: las solicitudes idénticas se reconocen sin duplicar y un nuevo archivo no puede reiniciar otra vez los movimientos de octubre. Se exige MP y PT y se deben incluir todas las filas con existencias. La captura posterior mostró cuatro artículos obsoletos con stock cero (Chocobits 450g, CB, CI y zanahoria deshidratada), bloqueados por catálogo o unidad. Se añadió “Omitir sin existencias” para excluir explícitamente filas con cantidad cero y costo nulo o cero, conservando el listado y la opción de volver a incluir. No se permite excluir cantidades positivas, vacías o costos pendientes durante el inicio. No se crean artículos innecesarios ni se cambian unidades para poder omitirlos. Esta corrección es de frontend y no requiere otro SQL; pasaron 20 pruebas de frontend y la compilación. Iván confirmó posteriormente que ya tiene el inicio establecido. Los artículos fuera del archivo quedan sin existencias anteriores. Si hay reservas pendientes se bloquea la confirmación: deben resolverse desde los pedidos. El token de revisión detecta cambios de inventario, reservas o catálogo antes de confirmar. Los reintentos de movimientos ya archivados y los movimientos anteriores al 01/10 quedan bloqueados. El respaldo se puede descargar como JSON desde el Kardex por un administrador.

Se mantiene el aviso de inventario provisional mientras se reconstruye octubre. La carga de OP históricas y el consumo automático por receta siguen pendientes; este inicio no completa ese circuito. Pasaron 18 pruebas de frontend, 16 escenarios SQL y `npm run build`. Iván confirmó el inicio real; no se dispone de una verificación independiente de la base.

### Pedidos de octubre: trabajo iniciado después del saldo

Iván pidió cargar pedidos desde el 01/10 hasta el 07/10/2026 y adjuntó tres PDF de TUTI, un CSV múltiple de Santamaría y `SMXB2B-PANGOLIN 26-10-07.zip`. Indicó que por ahora los pedidos de El Rosado se ingresarán manualmente desde la app. No cambiar ese flujo por otra importación.

Se agregó carga directa del ZIP de Favorita en Pedidos, leyendo solo los listados F…txt: cada orden aparece en cinco formatos en el ZIP y no debe importarse cinco veces. Conserva el número de orden completo del contenido, convierte cajas por unidades de empaque y quita únicamente el relleno con ceros de los códigos EAN de 13 dígitos. Los duplicados idénticos dentro del ZIP se unen y los conflictos bloquean la lectura. Mantiene el TXT antiguo. TUTI permite seleccionar varios PDF juntos. Todos usan vista previa y las comprobaciones existentes contra pedidos registrados; las fechas y cantidades inválidas de Favorita no se omiten silenciosamente.

Lectura comprobada de estos adjuntos: Favorita 7 órdenes y 5.878 unidades, entrega 01–08/10; Santamaría 5 órdenes y 416 unidades, fechas de cancelación 05 y 07/10; TUTI 3 órdenes y 4.380 unidades, entrega 05 y 08/10. Hay dos pedidos futuros para el 08/10: Favorita `100628082385` (811 unidades) y TUTI `4500378088` (140 cajas de 12 = 1.680 unidades). El pedido Favorita `100627393603` fue emitido el 30/09 y se entrega el 01/10: incluirlo en la reconstrucción de salidas de octubre. Los documentos no prueban cumplimiento ni son evidencia de despacho. El CSV de Santamaría identifica su fecha como cancelación; no asumir que es fecha real de salida.

La vista previa muestra fecha del pedido si el archivo la aporta y fecha de entrega. La base existente de pedidos sigue guardando `fecha_entrega` y `creado_en` (fecha de carga); la fecha original de pedido es informativa en esta vista previa, no se agregó una columna ni se cambió el dashboard. No afirmar que las estadísticas de fecha de creación ya reflejan octubre histórico. La importación registra estado INGRESADO y no registra un despacho. No hay nueva migración SQL ni dependencias.

Pendientes:

1. Iván confirmó el 08/10: “YA FUNCIONA LA CARGA DE PEDIDOS PERFECTO”. La carga de pedidos se considera funcional según su confirmación. El agente no consultó la base para comprobar qué pedidos quedaron guardados. Revisar el número de pedidos ya existentes en la vista previa y errores de catálogo/unidad por cliente. No crear aliases ficticios: el CSV usa también EAN Santa María `7861169008213` (sanduchero integral) y TUTI usa `7868304262219T`.
2. Confirmar cuáles pedidos ya fueron entregados y sus fechas/cantidades/lotes reales; reconstruir despachos sin duplicar salidas ni volver a tratar los entregados como pedidos pendientes definitivos.
3. Cargar producciones, compras y otras salidas de octubre y conciliar el Kardex. El consumo automático de MP por producciones históricas todavía no se ha completado. Los micros creados desde el saldo inicial no crean por sí solos sus recetas de producción.
4. Conservar el respaldo y el inicio único: no reiniciar otra vez el inventario para quitar errores de pedidos.

### OP confirmadas y comparación de consumos, 08/10/2026

Iván confirmó que funcionan los pedidos y quiere reconstruir producción y despachos del 1 al 8 de octubre sin exigir lotes físicos históricos; empezar con lotes reales desde el 09/10/2026. El criterio propuesto es referencias históricas por SKU/fecha, conservar las OP y sus consumos, contar el saldo físico al cierre y no hacer un nuevo reinicio del inventario.

Archivo revisado: `OP OCT 1-8.pdf` (Library `libfile_0e752d7a9b508191b02f0fc1e7327ae7`). Es ÓRDENES DE PRODUCCIÓN CONFIRMADAS (EGRESOS DE MATERIA PRIMA), distinto al reporte de OP liquidadas. La cabecera pide 01–08/10, pero sus 218 líneas y 28 OP corresponden solo al 01–03/10: 25 OP de PT (12 SKU) y 3 de MICRO ROLLO CHOCOLATE. Las fundas indican 6.764 unidades de PT; esto es una inferencia de empaque consumido, no una declaración independiente de producción neta. Micros: 159,201 kg (sumando ingredientes por OP, redondeados); costo total de líneas 4.935,80601 USD frente a 4.935,80600 impreso. No sumar la columna general Cantidad como PT: mezcla kilos y empaques. Totales de cantidad 9.882,54174 frente a 9.882,54173 impreso sirven únicamente para controlar lectura, no para stock.

Se agregó lector de PDF confirmado y comparación de consumo en la vista previa de Producción > Importar OP / revisar consumos. Se mantiene el lector de OP liquidadas y el Excel. El lector confirmado conserva las 218 líneas, exige números consecutivos y controles contra totales del PDF y rechaza una lectura incompleta. PDF.js a veces une número de fila+sucursal y cantidad+código; se separan sin convertir vacíos en cero. Especialmente las fundas de TUTI (1.920 y 1.010 unidades) deben leerse enteras aunque empiecen a la izquierda de otras cantidades. Un OP puede contener varios SKU y la agrupación sigue OP+SKU.

“Comparar consumos con recetas” consulta recetas FM vigentes en la sesión del usuario: vínculos reales de SKU a fórmula, versiones vigentes, fórmula final, recetas de micro, materiales y empaques. No equipara receta vigente hoy a receta históricamente usada en cada OP. Las cantidades se escalan al rendimiento de SKU o al kilo producido de micro. Rollo suma sus dos fórmulas y agrega empaque una sola vez. Se comparan los micros consumidos en PT como mezcla; las OP que producen micro comparan sus ingredientes por composición, evitando presentar su consumo nuevamente como consumo directo de PT. Código contable con ceros iniciales vincula si es único; no se crean aliases ni se adivina una receta o micro ambiguo. Una receta estructuralmente incompleta no genera una diferencia contra un subtotal. Los componentes no reportados se muestran sin cantidad real comprobada; los sin referencia no generan diferencias ficticias. Se usa tolerancia de 1% o 0,002 kg. “Descargar comparación” genera un JSON con referencias y resultados para que Iván pueda adjuntarlo a este chat.

Comprobado localmente: lectura del PDF real con PDF.js, 218 líneas, 28 OP, totales e inferencia de 6.764 unidades; 7 pruebas de parser y comparación y compilación. El agente no tiene sesión de Supabase para consultar las recetas vigentes ni afirmar diferencias definitivas de la base. El código SQL versionado contiene recetas iniciales, pero no prueba que sigan iguales después de cambios en la app.

Esta actualización no instala SQL ni modifica stock: la importación existente sigue alimentando el historial/dashboard. Falta publicar el frontend, ejecutar la comparación en la sesión real y revisar referencias pendientes. Para reconstruir el inventario faltan los documentos o confirmación de ausencia de producción del 04–08/10 y la cantidad neta de PT; luego completar el puente de OP a stock y consumos con idempotencia, validación de saldos y revisión cronológica de micros/compras. No descontar dos veces sus ingredientes y no decir que comparar equivale a cargar stock. Los despachos históricos todavía necesitan las salidas reales por pedido.

### Fechas reales y consumos históricos: aclaración del 08/10/2026

Iván aclaró que los consumos a conservar son los de las OP, pues las recetas vigentes de CIBUSPAN ONE pueden estar desactualizadas. No sustituir los consumos reportados por los teóricos ni actualizar recetas automáticamente a partir de diferencias. El JSON `comparacion_consumos_OP.json` consultado el 08/10 mostró 50 diferencias repetidas entre OP, 25 filas de agua no reportada y 40 consumos sin referencia; varios micros tienen nombres diferentes entre catálogo y fórmula. Integral se comparó contra v4 actual. Manjar mostró un patrón aproximado de mitad de consumo para las fundas, pero esto no demuestra cuál dato es incorrecto.

Iván dijo que el 01/10 no se produjo Manjar. El documento sí registra OP 26100102 con ambas fechas contables 01/10 y 96 fundas. Después explicó que las OP se ingresan al sistema contable uno o dos días después de producirse; por tanto las fechas del documento no necesariamente son las reales. La fecha real de esa OP sigue sin confirmarse. No anularla, moverla a un día inventado ni restar automáticamente uno o dos días a todas las OP. En operación regular de CIBUSPAN ONE se pretende registrar producción el mismo día, usando la sugerencia existente según pedidos.

Se agregó edición de fecha de producción por OP+SKU en la vista previa de importación histórica. Conserva fecha_registro y fecha_fin_original; guarda una observación de corrección o fecha provisional, recalcula rango y orden de la vista previa y comparación, y usa las fechas revisadas en el RPC existente. Los días vacíos o imposibles impiden enviar el lote. El JSON de comparación conserva también las fechas contables y las observaciones. Reimportar sigue actualizando por OP+SKU sin crear otra OP. No hay migración SQL nueva: estos campos ya existen en el historial. Esta edición aún no carga PT ni descuenta MP del Kardex. La fecha de Manjar permanece como propuesta del documento hasta que Iván indique el día real. Falta publicar el frontend; el agente no lo despliega por guardar un commit.

Validación de esta edición: 10 pruebas de lectura, comparación y revisión de fechas aprobadas; compilación aprobada. No se ha probado el guardado en la base real desde la sesión del agente.

### Trabajo activo: dashboard de visitas y rotación, 12/10/2026

Iván pidió pausar producción, pedidos e inventario y continuar el dashboard de visitas y rotación. Mantener pendientes las OP al Kardex, las producciones restantes y los despachos históricos; no reanudar ese trabajo sin que lo indique. Adjuntó captura del dashboard Comercial interactivo oscuro como referencia visual y pidió filtros de cliente, local e indicador y comparar todos los SKU en la semana actual y las cuatro anteriores.

Se sustituyó la vista Dashboard semanal de CampoComercial por DashboardVisitasRotacion, con diseño oscuro propio, cliente, local, indicador, tipo de visita (todas/mercaderista/KAM) y semana de referencia. Los filtros del dashboard son independientes del borrador y local de una visita en curso. Preserva registro, supervisión KAM, administración y evidencia de ubicación/fotos; no cambia DashboardV2 ni Comercial interactivo. El gráfico muestra cinco barras por SKU y una tabla con valores, cobertura y variación; conserva SKU sin dato y permite descargar CSV. Puede revisarse cualquier semana pasada con sus cuatro anteriores. Se carga hasta hoy en Quito para la semana en curso, sin inventar datos de los días futuros.

Las cinco semanas son calendario lunes-domingo, calculadas sin desplazamiento por UTC. Se usa la última revisión por cliente/local/SKU en cada semana, antes de agregar entre locales; no suma visitas repetidas ni arrastra valores de otras semanas o campos de una revisión anterior. Rotación, caras, precios y días se promedian entre locales con dato; stock del local se suma una vez; CD se promedia porque puede repetirse la misma referencia en distintos locales. Presencia, codificación, quiebres y con stock sin perchar son porcentajes entre observaciones verificables. Rotación es promedio diario reportado, no venta semanal comprobada. Cero se distingue de ausencia. Muestra cobertura y avisa que distintas coberturas pueden cambiar la comparación; semana actual señalada en curso.

El repositorio nuevo consulta com_kpi_campo_catalogo para opciones autorizadas y com_visitas_campo_sku con RLS y visita CONFIRMADA, paginando 500 hasta completar todas las filas. No usa el límite de 200 registros del RPC para reconstruir las series. El tipo de visita usa el rol guardado junto al autor coincidente; registros antiguos sin rol se mantienen en Todas. No instala SQL, no modifica visitas, recetas ni inventarios. No hay dependencias nuevas. La lectura real de Supabase sigue pendiente de comprobar desde la sesión de Iván. Falta publicar el frontend tras el commit.

Validación: 8 pruebas de semanas, timezone, filtros, últimas revisiones, sumas/promedios, ceros/nulos y variación; prueba de lectura simulada con 702 filas, paginación y error de permisos. No afirmar que se verificó visualmente en navegador: el ejecutable de Chromium no estaba disponible y la descarga falló; revisar la pantalla tras publicar. Scripts: `node --experimental-strip-types --test pruebas/verificar_dashboard_visitas.mjs`, `node pruebas/verificar_dashboard_lectura.mjs`, `npm run build`.

### Diagnóstico activo: visitas con SKU pero sin información, 12/10/2026

Iván informa que las visitas y SKU constan, pero faltan los valores que deberían leerse de las capturas. La revisión del código muestra que guardar() permite adjuntar imágenes sin ejecutar analizar(); subir archivos no ejecuta OCR. analizar() acepta lecturaTieneDatos() con solo local/código/nombre, por lo que puede anunciar lectura terminada sin cantidades. Son defectos comprobados del flujo, pero no prueban qué ocurrió en cada registro de producción. No afirmar que se consultó su base ni que las imágenes faltan: no hay acceso autenticado de Supabase del agente.

Se preparó `supabase/diagnosticos/visitas_capturas.sql`, SELECT de solo lectura para los 20 SKU guardados más recientemente. Incluye fechas de visita y guardado, número de capturas referenciadas y objetos presentes en storage, cantidades en columnas y en datos_ia, advertencias/confianza y definición instalada de la función concreta de guardado. No consulta archivos de otros módulos ni expone claves, no modifica datos ni permisos y no es una migración. Permite distinguir valores guardados ocultos por filtros/semana, datos en JSON sin columnas, imágenes faltantes y capturas almacenadas sin cantidades. Si solo hay imágenes sin cantidades, para distinguir lector no ejecutado vs lector que no reconoció datos hará falta una captura real o un registro de procesamiento: las visitas antiguas no guardan ese estado explícito. No reinterpretar ausencia como cero ni reemplazar automáticamente datos históricos.

Pedir ejecutar únicamente git pull y esta consulta con db query --linked --file y devolver la salida. No pedir otra publicación para obtener el diagnóstico. El guardado SQL versionado recibe las columnas numéricas explícitas y las conserva además en datos_ia, pero hay que verificar la función instalada. No cambiar todavía datos históricos ni atribuir la causa al usuario sin evidencia. Producción e inventario continúan pausados.

Consulta verificada en PGlite con cinco escenarios: columnas con cero real, cantidades solo en JSON, referencia a imagen inexistente, imagen existente sin cantidades y revisión física sin capturas. Una referencia repetida a una imagen existente no se confunde con archivo faltante. La consulta conserva filas y valores; no instala SQL ni requiere publicar. Para devolver el resultado desde PowerShell, db query --linked --file y --output json con Out-File -Encoding utf8; comprobar LASTEXITCODE antes de anunciar que el diagnóstico se generó.

### Resultado real del diagnóstico y corrección de capturas, 12/10/2026

Iván adjuntó `diagnostico_visitas.json` (Library `libfile_d9a8f45a55648191a7d99238ea813a0e`). Consulta 12/10 a las 17:31 UTC: 20 registros, 40 capturas referenciadas y 40 objetos presentes en storage. 19 registros tienen únicamente stock_local_unidades; uno no tiene cantidades. Ninguno tiene rotación, precios, código/nombre leído ni confianza de OCR. Columnas y datos_ia coinciden. Las caras ingresadas están conservadas. La función instalada corresponde al guardado completo versionado y sí recibe los campos numéricos. Evidencia: no faltan referencias de imágenes en este conjunto; las cantidades del lector no llegaron al guardado. No afirmar que se probó cada imagen visualmente ni que jamás se intentó el lector: no hay estado de procesamiento en los registros antiguos. La revisión abarca solo los 20 registros del archivo, no todas las visitas.

Se corrigió CampoComercial: capturas para lectura requieren ejecutar OCR y revisar antes de guardar; pulsar Guardar sin lectura ejecuta el lector y deja pendiente una segunda pulsación tras revisar. Reconocer solo local/nombre/código ya no anuncia lectura completa; exige al menos una cantidad reconocida. Puede elegirse explícitamente capturas solo de respaldo para ingreso manual. Sin capturas conserva el flujo manual. Guarda estado del lector y texto OCR limitado a 20.000 caracteres para diagnosticar errores futuros.

En Dashboard semanal > registros de visitas se agregó Releer capturas: abre las imágenes originales con URLs privadas, ejecuta OCR gratuito, muestra dato guardado / reconocido / valor a guardar. Conserva cantidades previas por defecto (incluso cero) y solo envía valores nuevos o corregidos. Comprueba códigos de SKU y coincidencia única de local cuando el lector los reconoce. Si no reconoce cantidades, permite revisar el texto y completar valores manualmente verificables, sin inventarlos. Nunca lee capturas ni guarda cambios en masa de forma automática.

SQL nuevo específico `supabase/migrations/202610120001_completar_lecturas_campo.sql`: instala solo RPC com_kpi_campo_completar_lectura. No cambia guardado existente ni políticas. Actualiza el detalle por su ID, sin nueva visita/SKU. Exige sesión, permiso Campo comercial, acceso al cliente y autor original o gerencia (ADMINISTRADOR/GERENTE, usando com_es_gerencia_kpi existente); bloquea visita no confirmada y token actualizado_en obsoleto. Lista estricta de campos numéricos/metadatos OCR; no permite cambiar fechas, SKU, autor, caras, fotos, georreferencia ni cobertura. Valores nulos no borran cantidades previas, cero explícito sí se conserva. Estado de recuperación y editor se añaden sin alterar responsable original. La instalación no completa datos de visitas: Iván debe releer y revisar en su sesión.

Aplicar únicamente este SQL con db query --linked --file, reparar exclusivamente 202610120001 después del éxito y publicar frontend. No db push. No se dispone de autenticación Supabase/Cloudflare del agente. Las visitas históricas aún no se han recuperado ni se ha verificado OCR contra las capturas reales, porque el archivo de diagnóstico no incluye imágenes descargables. Si el lector falla, obtener el texto reconocido o una captura real para ajustar su interpretación.

Pruebas: `node --experimental-strip-types --test pruebas/verificar_lectura_capturas.mjs`, `CIBUSPAN_SQL_TEST_MODULE=RUTA_PGLITE node --test pruebas/verificar_recuperacion_campo_sql.mjs`, lectura/dashboard existentes y compilación. Pruebas SQL usan las definiciones reales de com_visitas_campo/com_visitas_campo_sku de la migración original y simulan autenticación/alcance para probar permisos, token concurrente, conservación y ausencia de duplicados.

### Acceso visible a recuperar capturas, 12/10/2026

Iván informó que no encuentra “Releer capturas”. En el código anterior estaba dentro de dos desplegables, al final de una tabla ancha; no se dispone de confirmación de qué versión tiene publicada. Se agregó un botón visible “Releer capturas / visitas” inmediatamente debajo de los filtros de Dashboard semanal. Esa vista muestra tarjetas por fecha/local/SKU con botón directo “Releer capturas (n)” cuando hay imágenes guardadas, conservando filtros y la evolución semanal en su propia vista. La tabla de revisión de cantidades aparece después de leer; el guardado sigue actualizando el mismo detalle y requiere revisión del usuario. No se lee ni guarda en masa.

Cambio limitado a DashboardVisitasRotacion.tsx, su CSS y RecuperarLecturaVisita.tsx. No hay SQL nuevo. Sigue siendo necesaria la función de la actualización anterior 202610120001 para guardar lecturas recuperadas; su instalación y publicación no han sido confirmadas por Iván. Validación: compilación y revisión del diff; sin comprobación visual en navegador ni guardado en la base real.

### Lectura al seleccionar imágenes y recuperación conjunta autorizada, 12/10/2026

Iván solicitó que las capturas anteriores se relean juntas y que la mercaderista registre toda la información de una vez. Esto sustituye el criterio anterior de recuperar únicamente de forma individual: autoriza completar automáticamente cantidades verificadas de las capturas guardadas. Producción e inventario siguen pausados.

CampoComercial ahora ejecuta OCR local al seleccionar capturas, completa cantidades vacías y preserva los datos manuales (incluido cero). No sube archivos al leer: se cargan al guardar el SKU. El flujo habitual es elegir imágenes, revisar los campos completados y Guardar SKU una sola vez. Si un borrador restaurado no tiene lectura, Guardar puede ejecutarla y guardar usando directamente el resultado retornado, sin depender de que React haya aplicado los estados. Lecturas sin cantidades o de otro SKU/local bloquean ese guardado; sigue disponible el ingreso manual y capturas solo de respaldo. Hay protección contra resultados después de desmontar la pantalla y lectura simultánea. Mantiene cliente/local/GPS de la visita.

Dashboard semanal incluye botón directo “Leer y completar todas las capturas pendientes”. Procesa las visitas con imágenes y campos vacíos de las cinco semanas visibles, respetando cliente/local/tipo; omite capturas explícitamente solo de respaldo. Proceso secuencial por ID único: descarga URLs privadas, OCR, verifica local único y EAN coincidente (incluye alias T), confianza al menos 0,8, ausencia de valores contradictorios y cantidades válidas; completa exclusivamente campos vacíos mediante el RPC existente y token actualizado_en. Nunca crea visitas ni cambia fechas, caras, ubicación o cantidades previas. Los casos dudosos quedan REVISAR y los errores se muestran por visita sin anunciar éxito. Permite detener después de la lectura en curso; no puede deshacer un guardado ya enviado. Mantener la app abierta. Filtros se bloquean durante el proceso. El resultado distingue visitas con campos completados de las que no produjeron cantidades nuevas; “completada” no implica que la captura contenga los 14 campos.

El RPC existente conserva estado RECUPERADA_REVISADA. Para distinguir estas lecturas automáticas de una revisión humana, se agrega “Recuperación automática: campos vacíos completados; cantidades previas conservadas.” en advertencias de datos_ia, además del texto OCR y editor/fecha que ya audita el RPC. No hay nueva migración; sigue requiriendo la función 202610120001 de la actualización anterior. No se ha confirmado que Iván la haya instalado/publicado y el agente no tiene sesión para ejecutar la recuperación real.

Se corrigió el parser de OCR: las etiquetas de rotación/participación/predicción dejan de usar expresiones que podían consumir hasta otra etiqueta; valores se leen solo inmediatamente después de su propia etiqueta, sin usar números de otro campo. Campos vacíos/N/D permanecen nulos, negativos no se convierten a positivos, formatos numéricos mixtos ambiguos quedan sin reconocer y etiquetas con cantidades contradictorias se advierten. Local se reconoce solo en su cabecera, no en “Existencia en local”; múltiples locales o EAN diferentes no verifican identidad automática. Estas pruebas verifican texto simulado y reglas; no prueban la precisión del OCR sobre las imágenes reales.

Validación: 8 pruebas nuevas de parser y recuperación conjunta (ceros, datos manuales, identidad/calidad, contradicciones, ejecución secuencial, duplicados, cancelación, repetición), 3 pruebas anteriores de recuperación y compilación. Archivos: CampoComercial, DashboardVisitasRotacion/CSS, RecuperarLecturaVisita, nuevo RecuperarCapturasPendientes, campoComercialRepository, ocrFavorita, nuevo recuperacionCapturasCampo y pruebas/verificar_recuperacion_automatica.mjs. Falta publicar y procesar las capturas en la sesión de Iván; no afirmar datos históricos recuperados ni OCR real validado.

### Bloqueo de 149 registros y prueba de OCR real, noche del 12/10/2026

Iván adjuntó captura de la recuperación conjunta y `Markdown pegado.md`: 149 registros leídos, cero completados; 145 bloqueados por validación del local y 4 por confianza menor a 0,8, sin errores ni pendientes de procesar. La pantalla confirma que el frontend de recuperación conjunta está publicado; todavía no demuestra que el RPC de guardado esté instalado porque no llegó a invocarse. No confundir 149 registros con el número de archivos de imagen.

Adjuntó dos imágenes originales de EnPercha: `WhatsApp Image 2026-09-22 at 10.07.49 (1).jpeg` y `WhatsApp Image 2026-09-22 at 10.07.49.jpeg`, que muestran SUPERMAXI AMERICA / Integral EAN 7868304262189 y fecha fuente 21/09/2026 17:08:51. Se probaron realmente con Tesseract.js 6.0.1, idioma español. OCR anterior detectó `E LOCAL` o `S LOCAL` por el logotipo, rechazado por el parser anclado; también perdió decimales (2.40 → 240, un precio 2.14 → 214), y algunas etiquetas están partidas o incluyen descripción de categoría. Las imágenes de septiembre se usaron exclusivamente para probar el formato: no se ingresaron como visitas ni se aplicaron a octubre.

Corrección: `areaReporteFavorita` identifica por los píxeles las barras azules de la captura y delimita el cuerpo blanco, sin coordenadas fijas. En navegador obtiene píxeles con createImageBitmap/canvas y pasa el rectángulo a Tesseract con PSM.SINGLE_BLOCK; si no detecta el formato conserva OCR AUTO sobre la imagen. La cabecera se lee aparte para mantener fecha/hora fuente; la confianza usa el cuerpo del reporte. El parser admite una letra de logotipo antes de LOCAL, porcentajes junto a la descripción CLA/SCLA y etiquetas de predicción partidas. Tokens numéricos cortados o mezclados con letras no se transforman en una cantidad aproximada; porcentajes fuera de 0–100 quedan sin reconocer. Fechas ausentes no toman la fecha de otro campo.

Prueba real aprobada sobre ambas imágenes: local y EAN correctos, precios 2,53/2,14, rotación 0,63, venta diaria 1,36, predicción cero, participación 1,34/2,40, stock local 9, días local 14,22, CD cero, caja de 5, días CD cero, pedido sin cantidad/fecha y despacho 5 con fecha 21/09. Confianza del cuerpo 0,895. También pasó la preparación del patch automático preservando un stock manual cero; no se guardó nada en Supabase. No garantizar que las 149 capturas tengan idéntica calidad ni anunciar que se recuperaron.

Se permite descargar `diagnostico_lectura_capturas.json` tras la recuperación conjunta: conserva motivo por visita, local/SKU reconocidos, confianza, campos y texto OCR aun si la validación bloquea el guardado. No contiene imágenes ni URLs privadas. Esto permite diagnosticar los restantes sin repetir lecturas individuales. No hay SQL nuevo ni dependencias de la app nuevas. Falta publicar este frontend y repetir una vez la recuperación en la sesión real de Iván. Si llega a producirse un error del RPC, comprobar específicamente la instalación 202610120001; no reinstalar todo ni usar db push.

Validación: 10 pruebas de parser/recuperación conjunta y 3 de conservación de cantidades, compilación y `pruebas/verificar_ocr_favorita_real.mjs CABECERA.jpeg PARTE_INFERIOR.jpeg`, que ejecuta la función de producción con las imágenes reales y aserciones contra los valores visibles. La prueba opcional de imágenes usa Node, Tesseract y Python/Pillow para suministrar los mismos píxeles a la detección de área fuera de navegador; no requiere claves ni red de Supabase. No versionar las imágenes privadas, datos de idioma descargados ni archivos temporales de OCR.

### Revisión individual, fechas y guardado sin cambios: 12/10/2026, 21h

Iván informó fuera del hilo que “Guardar datos en esta visita” no funciona y que cantidad de último pedido contiene solo 2026. Cuatro capturas adjuntas muestran Rollo / SUPERMAXI IÑAQUITO del 12/10: el mensaje visible es “No hay cantidades nuevas o corregidas”, porque la columna Guardar mantiene los valores anteriores. No hay evidencia de un error del RPC en esa imagen: no se llamó porque el patch no tenía cambios. Algunas cantidades guardadas sí difieren: participación clase/subclase guardada 9/9, frente a 4/17,80 en la captura; cantidad de pedido guardada 2026, frente a pedido sin dato (—). La fecha 2026-10-10 corresponde al último despacho; no afirmar que es fecha de último pedido. El CD muestra 0 cajas de 7 unidades y 9 cajas de 5 unidades, por lo que hay 9 cajas en presentaciones distintas y no una capacidad única.

RecuperarLecturaVisita añade “Aplicar valores reconocidos”: reemplaza en la columna editable solo valores reconocidos y, cuando la fuente indica expresamente —/N/D, propone quitar ese dato de pedido/despacho. Esto requiere pulsar Guardar cambios; no modifica datos al leer o aplicar la propuesta. La conservación de manuales sigue siendo el comportamiento por defecto y la recuperación conjunta sigue completando únicamente vacíos. Dejar vacío un valor previo en revisión también marca borrado explícito y lo avisa junto al campo. Los errores y mensajes aparecen junto al botón final; un formulario sin cambios muestra el motivo y no invita a guardar un patch vacío. No confundir Guardar con Reconocido ahora.

Se incluyen fecha de último pedido y fecha de último despacho como campos tipo date separados de sus cantidades, consultados desde sus columnas existentes y guardados con ISO completo. Parser no extrae 2026 de 2026-10-10 como cantidad; no convierte campos sin dato en cero. En CD suma cajas de las presentaciones dentro de una misma captura, evita sumar nuevamente imágenes solapadas y deja capacidad sin reconocer si hay tamaños distintos; esto se avisa sin descartar toda la lectura. Si no se pudieron interpretar todas las presentaciones, no se inventa el total. El mensaje de confianza baja muestra el porcentaje y explica la revisión individual; no afirma que la imagen sea ilegible.

Migración nueva específica `202610120002_revisar_lecturas_campo.sql`: actualiza únicamente com_kpi_campo_completar_lectura, mantiene autor/gerencia, acceso al cliente, visita confirmada y token actualizado_en. Permite las dos fechas de pedido/despacho con validación estricta y `campos_borrar` solo entre las 14 cantidades y 2 fechas del detalle. Nunca permite borrar fecha de visita, SKU, fotos, caras, evidencia, autor ni permisos. Nulos ordinarios no borran; solo la lista explícita quita el campo y deja registro en lector_campos_quitados y datos_ia. No se ejecuta limpieza masiva ni corrección automática de valores previos. No modifica el RPC de registro de nuevas visitas ni otros módulos.

Aplicar exclusivamente SQL 202610120002 con db query --linked --file y registrar únicamente 202610120002 después del éxito; publicar frontend. No usar db push ni reparar migraciones antiguas por rutina. El SQL contiene la función completa y puede instalarla aunque 202610120001 no estuviera aplicada; no hace falta ejecutar ambas para esta actualización. El agente no lo ha instalado ni guardado la revisión del Rollo en producción.

Validación: 17 pruebas de parser/preparación, 11 escenarios SQL sobre tablas reales (12 tests contando el grupo), lectura simulada de 702 filas, prueba OCR real de las dos imágenes de Integral y compilación. Incluyen fechas completas/imposibles, borrado expreso de 2026, nulo sin borrado, permisos, concurrencia, ausencia de duplicados y conservación de evidencia. Las miniaturas de Rollo adjuntas se revisaron visualmente; no afirmar que se verificó su guardado en Supabase ni que se probó visualmente la UI nueva en navegador. Producción e inventario continúan pausados.

### Valores reconocidos frente a valores antiguos: 12/10/2026, 21:23

Cuatro capturas nuevas muestran Granos y Semillas / SUPERMAXI IÑAQUITO: imagen y texto OCR visible indican rotación 1,13 y stock 10, pero la tabla muestra rotación guardada 115 (lector “Sin reconocer”) y stock guardado 14 frente a reconocido 10. El gráfico muestra 115 porque usa el dato ya guardado. No afirmar que hubo un nuevo guardado o que el gráfico inventó esa cifra. La línea literal `VENTA PROMEDIO DIARIA (CANT): 1.13` sí se interpreta con el código local anterior; sin diagnóstico de texto completo/versión publicada no se conoce la diferencia exacta que causó su rechazo en la sesión real. Se admiten confusiones habituales I/l/1/T solo en la etiqueta DIARIA/PROMEDIO, manteniendo intactos los dígitos y decimales del valor.

Se cambió la revisión individual: al Releer, la columna Guardar propone directamente lo reconocido, en vez de priorizar lo ya guardado. proponerLecturaRevisadaCampo permite que el mismo texto llegue como 1,13 y 10 al payload de guardado y conserva intacto el objeto original. Cuando un campo no se reconoce, mantiene su dato anterior con aviso visible; si la captura indica explícitamente —/N/D en pedido/despacho propone quitarlo, avisando antes de guardar. Se resaltan filas con cambios. Esto sustituye el comportamiento inicial de conservación por defecto en la revisión individual descrito arriba; sigue siendo propuesta hasta pulsar Guardar. La recuperación conjunta y el ingreso manual de una visita nueva mantienen su conservación de datos previos: no se reemplazan cantidades históricas en masa.

No hay SQL nuevo: usa la función 202610120002 ya entregada para fechas/borrados explícitos. Su instalación no se ha demostrado con un guardado real. Falta publicar el frontend actual y guardar la revisión en la sesión de Iván; no se ha corregido desde el agente el 115 que está en la base. Verificación: 19 pruebas de parser/preparación, incluyendo texto → propuesta → payload con 115 → 1,13 y 14 → 10, ceros, campos no reconocidos y ausencias explícitas; compilación aprobada. No hay prueba visual de la UI nueva en navegador ni escritura en Supabase real.

## Comunicación con Iván

Responder en español, breve y sin negrillas. Explicar la acción y el resultado en términos operativos. Dar avisos de avance claros durante el trabajo. No repetir todo el historial ni forzar nuevos pasos de aprobación cuando ya están autorizados. Ante un bloqueo, explicar la causa concreta y lo que falta; nunca inventar resultados.

Pausar el desarrollo de funciones cuando Iván solicite una revisión o un traspaso como este. Reanudar con el objetivo que él indique y conservar el trabajo anterior.


### Auditoría con respaldo y calidad por campo: 13/10/2026 UTC (noche del 12 en Ecuador)

Iván solicita una solución urgente para obtener datos analizables, sin revisar todas las visitas cada vez. Se implementa auditoría explícitamente autorizada de cantidades antiguas, también las no nulas. Producción/inventario siguen pausados. No hay sesión autenticada Supabase/Cloudflare del agente: el código no equivale a publicación ni a registros reales recuperados.

OCR ejecuta dos segmentaciones sobre el cuerpo de cada captura. Cuando difieren, intenta releer la fila delimitada por los bloques/píxeles reconocidos; guarda texto/confianza de esa comprobación. Nunca mueve decimales por reglas ni calcula una cantidad faltante. Valida por campo coincidencia, identidad local/EAN, formatos, fechas, porcentajes y coherencia aproximada rotación × días frente al stock. Dos lecturas de Tesseract no garantizan exactitud absoluta: las excepciones quedan PENDIENTE. Fecha de cabecera usa una lectura compartida; no afirmar doble comprobación independiente de esa fecha. Evidencia conserva lecturas principal/control y confirmaciones de fila.

Botón visible “Auditar y corregir capturas” procesa las cinco semanas de los filtros cliente/local/tipo, ID único, secuencial, cancelable y con token actualizado_en. Incluye registros llenos, excluye respaldo manual. Corrige únicamente campos DOBLE_LECTURA o ausencia explícita SIN_DATO comprobada en ambas; los restantes conservan su columna anterior como pendiente. Protege declaraciones manuales por campo. Rechaza captura reconocida de otra fecha/local/SKU; no cambia fecha de visita. Resultado distingue visitas auditadas y número de campos pendientes, no afirma recuperación completa. Permite descargar diagnóstico con motivos y lecturas.

Nuevas visitas rellenan sólo cantidades con comprobación, muestran advertencias de pendientes y permiten ingreso manual. Cada edición numérica/fecha declara MANUAL_DECLARADO; las siguientes lecturas preservan ese dato (también cero). Se comprueba local/SKU seleccionado y fecha cuando reconocida. Revisión individual marca como REVISION_MANUAL los campos modificados; casilla “Comprobé este campo en la captura” permite verificar una cantidad existente sin cambiarla. Guardar no marca todos los campos como revisados.

Dashboard semanal usa por defecto “Validados y manuales declarados”: exige estado y valor coincidente con la columna real. No convierte pendientes en cero ni arrastra una visita anterior. Caras/presencia/codificación conservan su ingreso físico. Los datos antiguos explícitamente SIN_LECTOR o RESPALDO_MANUAL se identifican como ingreso humano; los antiguos con OCR sin verificación quedan pendientes. Selector de auditoría permite ver cantidades sin validar y advierte no usarlas para conclusiones; CSV identifica el modo. Este filtro afecta al dashboard semanal, no afirma que todos los reportes de otros módulos hayan incorporado calidad.

Nueva migración específica `202610130001_auditar_lecturas_campo.sql`: incluye definición completa de revisión 202610120002 más nuevo RPC com_kpi_campo_auditar_lectura y tabla com_lecturas_campo_auditoria. Aplicar sólo este archivo con db query --linked --file, reparar sólo 202610130001 tras éxito y publicar frontend. No db push ni reparaciones antiguas por rutina. La tabla conserva instantáneas anterior/posterior y evidencia por actualización auditada dentro de la misma transacción; RLS sólo lectura para autor/gerencia con permiso/acceso al cliente, sin escrituras directas authenticated. El RPC comprueba sesión/permiso/alcance/autor o gerencia/visita confirmada/token, lista de campos, valores de verificación iguales a columnas, identidad local/EAN y concordancia de evidencia para automático. Si falla, se revierten cambio y respaldo juntos. No inserta visitas/SKU ni modifica fotos, GPS, caras, autor o cobertura. SQL es necesario antes de usar guardado de auditoría/revisión nueva.

Validación: 33 pruebas de lógica/parser/dashboard; 17 escenarios SQL sobre tablas reales de campo en PGlite; consulta simulada de 702 filas; OCR real de las dos imágenes de Integral/Supermaxi América (septiembre, exclusivamente regresión, no cargadas a octubre). Todas las cantidades no nulas esperadas pasan DOBLE_LECTURA, incluida participación 2,40 confirmada por fila tras discrepancia 240 en AUTO. Compilación aprobada. No comprobación visual en navegador ni auditoría de las 149 visitas reales desde el agente. La instalación/publicación/ejecución real siguen pendientes de Iván. No garantizar que todas las capturas puedan recuperarse sin excepciones.


### Bloqueo de identificación de locales: diagnóstico real del 13/10/2026

Iván adjunta `diagnostico_lectura_capturas.json` tras detener la auditoría. Contiene 20 visitas procesadas de 208: 6 COMPLETADA, 14 REVISAR por local, 0 ERROR y 188 sin procesar. Las seis completadas confirman ejecución real del RPC de auditoría desde su sesión; la instalación/publicación de a201418 ya está comprobada en este alcance. No afirmar que las 208 visitas están corregidas. Hubo dos visitas sin modificaciones numéricas, dos con 2 campos corregidos y dos con 12 campos corregidos, conservando pendientes por campo.

Causa comprobada de 13 bloqueos: OCR sí escribe nombre completo y EAN, pero la cabecera comienza SH/SS/ES/NM/DL/M£, rechazados por el parser que sólo admitía una letra de logotipo. Principal/control incluyen los nombres correctos, se rechazan antes de guardar. Ajuste mínimo en ocrFavorita: prefijo corto de 1–3 letras o £ seguido de LOCAL al inicio de línea; no captura EXISTENCIA EN LOCAL ni resuelve nombres contradictorios. No cambia ni inventa cantidades, decimales o fechas.

El registro restante de MEGAMAXI 6 DE DICIEMBRE tiene nombre leído correcto en ambas pasadas, pero falla al resolver ID en el catálogo. El diagnóstico no incluye el catálogo/ID de local; no se ha probado si estaba desactivado o había coincidencias parciales. Se cubren ambas posibilidades: localDeCaptura prioriza coincidencia exacta única, deduplica sólo el mismo ID y continúa rechazando dos IDs con igual nombre. La auditoría incorpora referencias de locales históricos por ID/nombre leídos de las visitas, pues el catálogo de selección sólo muestra activos. Sigue verificando contra local_id de cada visita; no elige arbitrariamente otra sucursal. Los errores muestran local leído y local de la visita.

Nueva migración `202610130002_coincidencia_local_capturas.sql`: actualiza únicamente com_kpi_campo_auditar_lectura, usando la misma prioridad exacta antes de coincidencias parciales y manteniendo ambigüedad/alcance cliente, pruebas de evidencia, respaldo transaccional, concurrencia y permisos. Requiere la auditoría 202610130001, cuya ejecución está confirmada por los seis resultados COMPLETADA. Aplicar sólo archivo nuevo con db query --linked --file, registrar sólo 202610130002 después del éxito y publicar frontend. No db push ni reinstalación de módulos anteriores.

Pruebas: 33 tests de cabeceras/georreferencia/lectura/auditoría lógica, incluyendo reinterpretación de las 20 cabeceras reales en las dos pasadas; 19 tests SQL incluyendo prioridad exacta y rechazo de nombres duplicados; compilación y regresión OCR real de las dos imágenes originales de Integral. En replay se usaron los textos del diagnóstico y referencias simuladas basadas en nombres esperados: esto prueba interpretación, no acceso al catálogo real ni guardado de las 20 visitas. No se versiona el JSON privado ni las imágenes. La nueva instalación/publicación y ejecución real quedan pendientes del usuario; no afirmar cantidades restantes recuperadas por el agente.


### Auditoría completa y reanálisis sin repetir OCR: 13/10/2026, 10h36 Ecuador

Iván entrega `diagnostico_lectura_capturas (1).json`: 208 visitas, 199 COMPLETADA, 9 REVISAR, 0 ERROR, 0 sin procesar. La publicación de 29519db y ejecución real del RPC están confirmadas por resultados; no significa que los 16 campos de cada visita estén verificados. Captura previa de 138/208 mostraba guardados confirmados; el dashboard sólo se refresca al finalizar. El agente no accede a Supabase/Cloudflare autenticado.

Nueve excepciones comprobadas en texto: fotos de percha (Tumbaco/Mantequilla y Ramírez Dávalos/Granos), lista de productos sin detalle (Cumbayá/Maíz y La Cerámica/Dulce), detalle sin cabecera/código (San Bartolo/Granos), Granos adjuntado a Mantequilla en Quicentro Sur, logotipo `$ LOCAL` en Granda Centeno/Granos, mezcla de Mantequilla y Maíz en América/Maíz, y reporte de 21/09 registrado como visita 22/09 en América/Integral. No inventar históricos desde fotos/listas ni aplicar el SKU equivocado. El caso de septiembre está fuera del arranque de octubre; no cambiar su fecha automáticamente.

Se admitió `$` como prefijo corto de logotipo junto a LOCAL. Nuevo selector por archivo identifica cabeceras en ambas pasadas, conserva únicamente el SKU esperado y sus continuaciones posteriores con fecha/hora compatible; otro SKU corta la asociación. Nunca copia valores del producto excluido. Todas las llamadas desde visita/revisión/auditoría reciben código esperado del catálogo o detalle real. Guardan textos/confianza por archivo y confirmaciones de fila con índice. Si no existe cabecera comprobada, se mantiene el texto para diagnosticar y no se fuerza la identidad. Una continuación sin timestamp se asocia sólo dentro del contexto del SKU; no afirmar verificación independiente de GPS/fecha de cada imagen. El algoritmo conserva controles por campo y contradicciones.

Se detectan 129 lecturas de cantidad de pedido 5 sin fecha de pedido reconocida; algunas incluso fueron DOBLE_LECTURA. No afirmar que las 129 imágenes muestran el mismo valor real o que se comprobó visualmente un guion en todas: el JSON sólo permite comprobar lectura y falta de fecha. Las cantidades positivas de pedido/despacho requieren fecha asociada válida coincidente en ambas pasadas antes de validación automática. Cantidades dudosas anteriores permanecen en columna, marcadas PENDIENTE, nunca se borran/ponen cero por suposición. Se conservan declaraciones manuales explícitas y cero. Si una fecha manual conservada difiere del reporte, no se valida automáticamente su nueva cantidad.

Nuevo flujo visible “Corregir desde diagnóstico JSON” en RecuperarCapturasPendientes: acepta el diagnóstico original descargado, reinterpreta sus dos textos y confirmaciones sin descargar ni ejecutar OCR. Usa IDs actuales cargados bajo los filtros, tokens actualizado_en actuales, el mismo RPC autorizado y respaldo por registro. Bloquea JSON inválido/duplicados antes de iniciar; sólo procesa filas presentes en el alcance actual; respeta respaldo/manuales/cancelación/concurrencia. Para diagnósticos antiguos reconstruye bloques por Detalle del producto sólo si ambas pasadas tienen igual número; no reutiliza confirmaciones antiguas sin índice cuando excluye otro SKU. El archivo no constituye una firma criptográfica; es evidencia aportada por el usuario autorizado, validada por identidad, formato, fecha y concordancia. No se ejecutan URLs/código del JSON. Incluye conteo visible de guardados/pendientes/errores durante proceso y avisa que el gráfico se refresca al terminar. Instruir a Iván seleccionar este JSON; no obligarlo a otra lectura de 208 imágenes.

Protocolo de validación pasa a 20261013.2. Nueva migración específica `202610130003_validacion_pedidos_capturas.sql` actualiza sólo com_kpi_campo_auditar_lectura con función completa: versión nueva requerida, cantidad automática positiva exige fecha en ambas evidencias y coincidencia con fecha realmente guardada, manteniendo restricciones de identidad, actor/gerencia, alcance, token, evidencia y respaldo transaccional. Cliente antiguo no puede certificar con protocolo anterior. Revisión manual explícita sigue disponible. Aplicar sólo archivo 202610130003 y reparar sólo 202610130003 tras éxito; publicar frontend. Requiere tabla/función de auditoría ya confirmadas. No db push ni tocar producción/inventario.

Validación: 74 tests (28 lógica/cabeceras/selector/reanálisis, 24 anteriores dashboard/lectura/georreferencia y 22 SQL), consulta simulada de 702 filas, OCR real de las dos capturas originales de Integral y compilación. Replay de JSON completo prepara 201 registros y deja 7 bloqueados sin escribir en Supabase; corrige Granda Centeno y separa América/Maíz con stock 3, afiliado 2,18 y días 6,42, sin arrastrar Mantequilla. Las referencias/columnas usadas en replay son simuladas: no afirmar 201 recuperadas en base real. JSON e imágenes privadas no se versionan. Falta instalar/publicar la versión nueva e importar el diagnóstico en sesión de Iván; las seis excepciones de octubre necesitan fuentes completas/correctas y la de septiembre revisión de fecha si se decide incluirla. Datos fuente ausentes no son recuperables mediante código.

### Rotación comprobada con stock / días: 13/10/2026, tarde Ecuador

Iván solicita resolver las rotaciones incorrectas comprobando stock del local dividido por días de inventario; confirma que actualmente sus rotaciones son menores de 100. Se incorpora conciliación específica antes de verificar campos, tanto en OCR nuevo/relectura individual como en reanálisis del JSON. Requiere stock entero positivo y días positivos coincidentes en ambas pasadas, identidad local/EAN comprobada y confianza >=0,65. Sólo selecciona una rotación literal presente al menos dos veces en las lecturas de las imágenes incluidas del SKU que concuerde con el cociente; no calcula una cantidad faltante, no divide por cero ni mueve decimales por suposición. Dos candidatos compatibles quedan pendientes. Rotaciones >=100 se bloquean para validación automática; declaraciones manuales se mantienen protegidas.

Tolerancia de coherencia: máximo de 0,05 unidades de stock, 1% del stock y propagación del redondeo de rotación/días a dos decimales. Sustituye el anterior máximo de una unidad / 5%, que era demasiado amplio para pequeños stocks. Cero de rotación con stock positivo y días positivos incoherentes también queda pendiente; cero explícito con stock/días cero se conserva. Evidencia `lectura_control.comprobacion_inventario` guarda método STOCK_DIVIDIDO_DIAS, stock/días/cociente, candidato aceptado, tolerancia, observaciones y valores agregados anteriores; los textos originales por archivo permanecen intactos. Se mantiene protocolo 20261013.2 y el RPC existente: no requiere nueva migración ni dependencias.

Caso real del diagnóstico anterior: América / Granos y Semillas del 12/10, ID 10e65c28-ce9c-4c28-abf4-292fb0b0f6ed, stock 10 y días 8,83; principal agregado era nulo por conflicto 113 frente a 1,13, control 1,13. Reanálisis ahora acepta 1,13 como DOBLE_LECTURA y prepara su corrección usando el RPC con respaldo. Esto se probó localmente sobre texto real, sin guardar en Supabase. No afirma reparación de venta diaria ni otros campos pendientes, ni resuelve el ERROR de la última captura de 217 resultados cuya causa todavía no se ha proporcionado. El contador general de pendientes y resúmenes repetidos siguen siendo pendientes de UX; no se modifican en esta actualización.

Validación: 78 tests (32 lógica/parser/reanálisis con las 208 visitas reales, 24 dashboard/lectura/georreferencia, 22 SQL), consulta simulada de 702 filas, OCR real de las dos imágenes originales de Integral y compilación. Reanálisis conserva los siete bloqueos anteriores por falta de evidencia/fecha/SKU. Pruebas específicas de conflicto 113/1,13, límite 100, stock contradictorio, días cero, candidatos ambiguos y otro SKU. Archivos modificados: validacionLecturasCampo, ocrFavorita, reanalizarDiagnosticoCapturasCampo, dos archivos de pruebas y esta guía. Producción/inventario continúan pausados. Pendiente publicar el frontend y seleccionar el JSON original en “Corregir desde diagnóstico JSON” en la sesión del usuario; no repetir OCR masivo ni SQL anterior por rutina.

### Releer, guardar comprobados y mostrar el gráfico: 13/10/2026, 16h Ecuador

Iván adjunta tres capturas: EnPercha Granos y Semillas EAN 7868304262196 / SUPERMAXI GRANDA CENTENO / 12/10 12:35:07 con rotación 1,60; revisión individual reconoce 1,6 con dos lecturas coincidentes, pero “Ya guardado” está vacío; gráfico sin dato. Esto confirma que esa revisión era una propuesta sin persistir, no un valor almacenado que el gráfico estuviera dibujando mal. No hay captura de un guardado exitoso de este caso en producción.

Cambio de flujo autorizado: botón individual pasa a “Releer y guardar comprobados”. Después de OCR invoca guardarLecturaComprobadaCampo, que reutiliza prepararAuditoriaCapturaCampo y el RPC com_kpi_campo_auditar_lectura con token, permisos, identidad/fecha, protección de manuales y respaldo existentes. Guarda sólo si hay datos DOBLE_LECTURA y algún campo comprobado/SIN_DATO nuevo o no validado; no escribe de nuevo cuando ya está guardado y validado. Omite respaldo manual y respeta cancelación antes del RPC. Espera confirmación real del RPC; sólo después refresca datos y abre Evolución semanal. Ningún dato del gráfico se alimenta de un borrador reconocido. Si falla, el error aparece encima de la tabla, sin anunciar éxito. Revisiones manuales de campos pendientes siguen disponibles. Ref impide lectura/guardado duplicado por doble clic en el mismo componente; concurrencia entre registros/procesos continúa protegida por los tokens de base.

También se detectó una incompatibilidad adicional en la evidencia real del diagnóstico de Granda: principal interpretaba “— SUPERMAXI GRANDA CENTENO” y control “SUPERMAXI GRANDA CENTENO”. La validación JS normalizaba ambos como iguales, pero el RPC exige nombres de evidencia literalmente iguales. Parser elimina los separadores de la etiqueta LOCAL antes de extraer el nombre en las dos pasadas; texto OCR original permanece intacto, nombres distintos siguen bloqueados. Este ajuste también beneficia auditoría conjunta e importación JSON. No afirmar que ésta sea la causa comprobada del ERROR de los 217 resultados anteriores sin su texto concreto.

Prueba integral local con el JSON real de Granda y las funciones SQL existentes instaladas en PGlite: reanálisis → guardado auditado 1,60 → lectura de columna/QC → serie semanal validada 1,60; conserva fotos e identidad. Usó un registro de prueba con los 16 valores actuales leídos de la base simulada, igual que el repositorio real. No se escribió en Supabase de producción ni se hizo prueba visual en navegador. Validación: 81 tests (58 lógica/parser/reanálisis/dashboard/georreferencia, 23 SQL incluido este recorrido), consulta simulada de 702 filas, compilación y git diff --check. No SQL nuevo, protocolo sigue 20261013.2, sin dependencias nuevas.

Publicar frontend desde main con git pull, npm run build y wrangler pages deploy. Para este caso basta pulsar una vez “Releer y guardar comprobados” en Granda/Granos; también se puede reutilizar el JSON original para la corrección conjunta. No obligar a repetir OCR de todos los locales ni reinstalar SQL. El agente no tiene sesión de Cloudflare/Supabase; no afirmar publicación ni reparación de datos reales. Contadores de campos pendientes y resumen genérico de auditoría permanecen pendientes de UX. Producción/inventario siguen pausados.

### Datos automáticos sin auditoría local por local: 13/10/2026, 17h Ecuador

Iván aclara que releer/auditar manualmente muchos locales no cumple el objetivo: la información debe estar disponible automáticamente. Se sustituye la recuperación manual como flujo principal por procesamiento automático al abrir el dashboard, bajo sus cinco semanas y filtros. No prometer ejecución con la app cerrada ni un servicio de OCR en servidor: este proceso usa la sesión y el navegador abiertos; nuevas visitas siguen leyendo al seleccionar capturas y persisten al Guardar SKU, que incluye los datos físicos de percha.

Nuevo procesamientoAutomaticoCampo: reutiliza primero las dos lecturas originales de datos_ia.lectura_control, reinterpretadas con el parser actual. Descarga/relee imágenes sólo si falta esa evidencia, la identidad/fecha no pasa la preparación o rotación/stock/días siguen sin comprobar. Es secuencial, deduplica ID y cancela antes del RPC; no alimenta el gráfico desde borradores. Guarda con com_kpi_campo_auditar_lectura, misma versión 20261013.2, respaldo transaccional y token. Actualiza el dashboard cada diez guardados y al terminar. Protege manuales explícitos y excluye RESPALDO_MANUAL / SIN_LECTOR.

Se persiste marca de versión 20261013.5, rutas exactas y estado/motivo bajo lectura_control.procesamiento_automatico, usando el JSON permitido por el RPC existente. Aunque haya campos auxiliares pendientes, la misma versión/capturas no se procesa otra vez en cada apertura. Capturas diferentes o nueva versión de este procesador habilitan otra pasada. Un bloqueo de identidad/fecha/fuente registra sólo la excepción, con verificacion_campos vacío: conserva las cantidades, certificaciones y evidencia principal anteriores y agrega la lectura fallida aparte. Fallos de red/permiso/guardado no se certifican ni marcan como procesados, se muestran como ERROR; no reintentan en bucle durante la misma apertura. Reabrir permite nuevo intento de estos errores transitorios. No decir que una captura bloqueada recuperó datos por haber persistido su excepción.

Repo dashboard expone lectura_almacenada y autor real de la visita. Permiso de procesamiento se deriva del puede_administrar del catálogo autenticado; gerencia/administración procesa el alcance visible, los demás sólo sus visitas según getUser/registrado_por. El RPC sigue siendo autoridad de permisos. Se evita intentar modificar visitas ajenas desde cuentas de KAM/mercaderista. No usa responsable_id declarado como autorización.

RecuperarCapturasPendientes inicia automáticamente, muestra avance y permite detener/continuar. Herramientas de auditoría/JSON se conservan bajo un desplegable opcional, no son necesarias para el flujo normal. Muestra excepciones persistidas con nombre del campo/motivo aun después de reabrir. Los pendientes legítimos no obligan a repetir todo el proceso. La marca no declara precisión absoluta ni inventa datos de imágenes inexistentes: se muestran cantidades comprobadas y las excepciones verdaderas. Los resúmenes distinguen visitas con datos guardados, excepciones y errores.

Guardar visita nueva añade la marca cuando los tres campos principales están comprobados, evitando recuperación redundante en el tablero; conserva motivos de campos auxiliares pendientes. Si los principales faltan, la posterior recuperación automática hace un intento con los originales. guardarVisitaCampo exige un UUID real confirmado por el RPC antes de anunciar éxito; null/respuesta vacía no limpia el SKU como guardado. Flujo cliente/local/GPS y una sola visita por SKU se mantienen.

Verificación: 88 tests (65 lógica/parser/dashboard/georreferencia incluidos siete nuevos de automatización, 23 SQL), consulta simulada de 702 filas con gerencia y acceso sólo del autor, compilación y diff sin errores. Casos: Granda 1,60 recuperado automáticamente desde evidencia sin otro JSON/OCR, guardar y graficar desde columna/QC real de PGlite, persistir marca y no repetir pendientes, leer imágenes una vez por ID cuando falta texto, manual cero, cancelación, otra fecha, error de descarga/guardado y visita nueva con respuesta vacía. Fotos e identidad permanecen. No se ejecutó en Supabase real ni se probó visualmente en navegador. Imágenes/JSON privados no se versionan.

Sin SQL ni dependencias nuevas. Publicar main con git pull, npm run build y wrangler. Después basta abrir el dashboard y dejar terminar el procesamiento inicial; no exigir auditoría, importación JSON ni relectura local por local. El agente no tiene sesión de Cloudflare/Supabase: falta publicación y ejecución real en la sesión del usuario. Producción/inventario y sell-out continúan pausados. Cambios: nuevo util y test de procesamiento automático; RecuperarCapturasPendientes, campoComercialRepository, dashboardVisitasRotacionRepository, tipo RegistroDashboardCampo, pruebas de consulta/SQL y esta guía.

### Estado de capturas comprensible y registro diario: 14/10/2026, 11h Ecuador

Iván adjunta image(20261014-163822).png: procesamiento finalizado, 251 “visitas con datos guardados”, 230 “visitas con excepciones”, cero errores y cero sin procesar. Confirma frontend de procesamiento automático publicado y guardados reales confirmados; no confirma que todos los campos estén completos. Esos contadores describen registros de SKU, no locales físicos ni archivos. COMPLETADA puede tener campos pendientes, por lo que las categorías anteriores se superponen; 230 no significa 230 archivos que no subieron. Sin detalle actualizado no afirmar cuántos pendientes son rotación o cuántos sólo auxiliares. Las capturas del proceso ya están vinculadas a registros persistidos; el agente no inspeccionó cada objeto remoto ni escribió datos reales.

Nuevo estadoDatosCampo y tarjetas en RecuperarCapturasPendientes separan: registros de SKU guardados, archivos de capturas distintos, rotaciones disponibles comprobadas/manuales y rotaciones pendientes. Otros campos pendientes se cuentan aparte; un pedido pendiente no oculta una rotación comprobada. Usa columnas/QC persistidos actuales, no el texto del último OCR. El resumen del proceso divide categorías mutuamente excluyentes: sin excepciones, datos guardados con pendientes, lectura bloqueada, error y sin cambios. No suma el mismo registro dos veces. Excepciones respetan los IDs de los filtros actuales y un resumen de un proceso de otro alcance deja de mostrarse como si fuera del local seleccionado. Diagnóstico completo sigue accesible en herramientas avanzadas. No cambia el protocolo OCR ni la versión 20261013.5 del procesamiento automático: no obliga a reprocesar de nuevo las capturas.

Nuevo dashboard independiente “Comercial · Visitas diarias”, accesible en menú Comercial y alias “Visitas diarias”, ambos bajo el permiso existente Campo comercial. Página VisitasDiarias lee visitas CONFIRMADA con el repositorio paginado existente; no ejecuta OCR ni escrituras. Fecha por defecto del primero del mes al día actual en Ecuador. Filtros desde/hasta, cliente, local y responsable; atajos Hoy/Este mes, actualización y descarga CSV. Una fila por fecha de visita + cliente_id + local_id, conservando KAM/mercaderista juntos como responsables. Diez SKU son una visita diaria a un local. Deduplica IDs y SKU del mismo local/día; para rotación usa el último registro de cada SKU, sin rellenar con uno anterior si el nuevo está pendiente. Visitas registradas permanecen visibles aunque no haya lectura válida. Muestra capturas, SKU, rotaciones disponibles y SKU con campos pendientes por separado.

La fecha es fecha_visita. Horas son visitado_en de los registros de SKU, convertidas a Ecuador; si son de otro día se agrega ese día. No certifican inicio/fin ni duración física. No confundir visitas registradas con prueba GPS. Repo expone visita_id y nombre del responsable sólo si responsable_id de datos_ia coincide con autor real; históricos sin nombre quedan identificados como tal, sin inventar una persona. Añade únicamente id a la relación ya consultada. Campos y permisos existentes, sin migración. CSV escapado para no ejecutar texto como fórmula al abrirlo; no se genera archivo privado en el repositorio.

Verificación: 40 tests (7 nuevos de agrupación diaria/estado/resumen, 14 anteriores dashboard/lectura, 12 permisos y 7 procesamiento automático), consulta simulada de 702 filas con IDs de visita, nombre de autor y descarte de nombre ajeno, compilación y diff sin errores. Pruebas incluyen diez SKU/una visita, KAM y mercaderista juntos, filtros, fechas de visita, separación por cliente/local, último registro pendiente, cero manual, ausencia explícita y conteos sin solapamiento. No prueba visual en navegador ni lectura de base de producción. Dashboard ejecutivo, costos por devengo, producción/inventario y sell-out intactos.

Cambios: App, menú Layout, permisosAplicacion, RecuperarCapturasPendientes, dashboardVisitasRotacionRepository y su tipo; nueva página/CSS VisitasDiarias, utils estadoDatosCampo y visitasDiariasCampo, test verificar_visitas_diarias y ajuste de prueba de consulta; esta guía. Publicar frontend desde main con git pull, npm run build y wrangler. Sin npm ci, SQL nuevo ni nuevas dependencias. El agente sigue sin sesión Cloudflare/Supabase; sólo código guardado, publicación pendiente de Iván.

### Revisión permanente por campo: 14/10/2026, petición posterior a visitas diarias

Iván cambia el flujo: no quiere auditoría masiva en cada apertura. Quiere revisar únicamente datos dudosos por día, ver el fragmento de la captura junto al campo, corregir/confirmar y guardar una vez. Valores pendientes siguen visibles como provisionales, SKU rojo y enlace al dato concreto. Esta decisión sustituye las instrucciones anteriores de ocultar siempre los valores pendientes y arrancar auditoría masiva automáticamente. No volver a imponer ese flujo.

Nuevo módulo Comercial · Revisión de datos con permiso existente Campo comercial. RevisionDatosVisitas consulta registros confirmados con el repositorio paginado existente. RevisionDatosCampo presenta una cola de campos realmente pendientes y selecciona por defecto hoy (Ecuador), con selector de otras fechas. Los enlaces desde gráfico/tablas/Visitas diarias abren el registro y campo seleccionado usando sessionStorage. Al pulsar un indicador, prioriza su campo si está pendiente. Todos los pendientes siguen accesibles, no reaudita campos revisados. No considera un dato ausente confirmado como un error.

Carga originales privados mediante obtenerFotosCampo. recorteCampoImagen localiza etiquetas con Tesseract en la imagen seleccionada y produce regiones para un SVG; incluye etiqueta y siguiente línea del valor. Esto es localización visual, nunca vuelve a interpretar ni escribir cantidades. Cache por ID/capturas durante la sesión del módulo, acceso a imagen completa y fallback si la etiqueta no se localiza. No afirma que el recorte automático siempre encuentre la fila. Si la imagen falla, muestra error; conserva los registros. No se versionan fotos ni diagnósticos privados.

prepararRevisionDatoCampo valida formatos, modifica exclusivamente el campo seleccionado y guarda REVISION_MANUAL con el valor exacto, incluido cero o ausencia explícita. Confirmar el mismo valor sólo modifica su certificado. Checkbox exige comprobar dato, fecha, SKU/local. Usa completarLecturaVisitaCampo y el RPC auditado ya instalado con token actualizado, permisos de autor/gerencia y respaldo transaccional. No anuncia éxito sin confirmación del RPC. No inserta nuevas visitas ni SKU. Preserva principal/control y la marca de procesamiento, evitando que guardar manualmente dispare otra lectura. El guardado manual antiguo también preserva lectura_control. Una corrección no cambia los certificados de otros campos.

Dashboard muestra por defecto todos los valores disponibles, con SKU y semanas pendientes en rojo y botón Revisar. Mantiene selector sólo verificados; rojo significa algún campo pendiente del SKU, no que todos sus campos sean erróneos. El CSV agrega estado por semana. Señales y enlaces se calculan sobre el último registro por cliente/local/SKU/semana, sin arrastrar pendientes antiguos. combinarLecturaValidadaCampo conserva valores reconocidos dudosos con etiqueta PENDIENTE, sin presentarlos como verificados; SIN_DATO explícito queda NULL. Los datos que nunca se pudieron leer no se inventan. Históricos ya borrados a NULL no se rellenan automáticamente por este cambio.

RecuperarCapturasPendientes deja automatico=false por defecto: entrar al dashboard no reaudita los 250 registros. Herramientas avanzadas explícitas siguen disponibles. Los nuevos SKU se leen en la carga y se marcan procesados aunque tengan campos pendientes. visitasSinProcesarCampo no habilita otra pasada simplemente porque cambió la versión del algoritmo: misma lista de capturas con marca = ya procesada. Otra captura puede requerir procesamiento. La revisión cotidiana sucede en el módulo filtrado por día, sin tarea programada en servidor. No hay migración ni dependencia nuevas.

Verificación: 110 tests pasados (39 validación/procesamiento/dashboard/diarios/permisos, 4 nuevos revisión/recorte, 44 regresión de parser/diagnóstico/recuperación/georreferencia, 23 SQL PGlite), consulta simulada de 702 filas, build y diff sin errores. El caso Granda real usa diagnóstico local y RPC en PGlite: confirma manualmente 1,60, conserva fotos, elimina el pendiente seleccionado, mantiene marca y cantidad de filas. No se escribió en Supabase real ni se probó visualmente en navegador. Costos/devengo, producción/inventario y sell-out intactos. Código a guardar en main; agente sin sesión Cloudflare/Supabase. Publicación pendiente del usuario: git pull, npm run build, wrangler; no SQL ni npm ci necesarios.

### Cantidad de CD no aplica: 14/10/2026, 13h47 Ecuador

Iván pide dejar de leer/guardar cantidad del CD porque no aplica y genera muchos pendientes. Se excluye únicamente stock_cd_cajas del catálogo de cantidades/validación/revisión. Parser devuelve null y deja de sumar cajas o advertir sobre cantidad CD; conserva capacidad de caja y días CD. Se elimina input Stock CD del formulario y opción Stock del CD del selector del dashboard. RPC de visita nueva y actualización filtran cantidad CD y su certificado, incluso si llega evidencia antigua. No se borran datos históricos ni capturas. Sus etiquetas PENDIENTE antiguas ya no cuentan en revisión/estado/SKU rojo; restantes campos sí. No obliga a reauditar o corregir uno por uno. Stock del local, rotación y días de inventario local se conservan. Sin SQL ni dependencias nuevas. Pruebas de revisión incluyen cantidad CD antigua excluida, parser sin cantidad CD y stock local intacto. Publicación del frontend sigue pendiente del usuario.

### Ingresos manuales Rosado/Santamaría: 14/10/2026, 15h Ecuador

Iván confirma que Rosado y Santamaría ingresan datos manualmente, no desde capturas; Rosado Valle apareció indebidamente en revisión. esIngresoManualCampo unifica clasificación: SIN_LECTOR/RESPALDO_MANUAL son manuales; históricos sin capturas ni texto OCR ni evidencia principal/control también se reconocen manuales. No se infiere sólo por nombre del cliente, para evitar certificar imágenes dudosas. estadoDatosCampo excluye registros manuales de la cola OCR, incluidos campos opcionales ausentes o etiquetas pendientes antiguas. valorIndicadorValidadoCampo conserva sus valores como declaraciones manuales sin exigir doble lectura. Guardar visita manual genera certificados MANUAL_DECLARADO de los valores ingresados en vez de conservar un mapa parcial/vacío. No convierte datos de OCR existente en revisión humana ni escribe certificados en históricos. Foto de respaldo manual no exige OCR. Test cubre Rosado/Santamaría sin lector, históricos sin evidencia, respaldo con imagen y OCR que conserva pendientes. Fixture de validación OCR ahora declara su captura realista. Sin SQL ni dependencias nuevas; publicación pendiente del usuario.

### Fotos de percha subidas por error al lector: 14/10/2026, 15h09 Ecuador

Iván precisa la causa: Rosado/Santamaría suben fotos de estantes en capturas_app por error. El criterio anterior basado sólo en origen/sin capturas no cubría esto. Ahora esIngresoManualCampo reconoce también cliente_nombre normalizado ROSADO/SANTAMARIA. Repositorio dashboard añade nombre del cliente desde catálogo autenticado y clasifica estos registros como RESPALDO_MANUAL para la vista, incluso con capturas/evidencia OCR antiguas. Evita revisión, marcas rojas y procesamiento automático de esas fotos; conserva cantidades y originales sin borrar ni mover archivos ni certificar históricos en DB. No afirma recuperar valores borrados o corregir cantidades extraídas mal en procesos anteriores.

CampoComercial muestra lector únicamente cuando nombre cliente contiene FAVORITA; guarda cliente/local y fotos de percha como antes. Texto explícito: sólo capturas de En Percha Favorita, fotos de estantes/productos van en Fotos de percha. Botón renombrado Cargar capturas de Favorita. Guardas de selección/análisis bloquean otros clientes aunque se llame handler directamente. Rosado/Santamaría ingreso manual y respaldo; no exige OCR para borradores con fotos mal ubicadas, y guardado normaliza lector_estado a RESPALDO_MANUAL. No modifica Dashboard ejecutivo ni costos/producción. Sin SQL. Verificación: 22 tests de revisión/dashboard/diarios, consulta simulada 702 filas, build y diff sin errores; nuevas pruebas con ROSADO/SANTAMARIA, fotos y evidencia OCR incorrectamente asignadas conservadas sin pendientes, Favorita conserva pendientes reales. No inspección visual del adjunto inaccesible ni base remota. Publicación pendiente del usuario.

### Correos al guardar descuentos: 22/10/2026

Iván solicita seleccionar destinatarios antes de guardar descuento y que reciban por email toda su información. DescuentosPromociones agrega checkbox de usuarios activos con correo y registro de últimos 200 avisos. Selección mantenida mientras pantalla está montada, editable por descuento; sin destinatarios no envía. No se agregan contactos externos ni preferencias permanentes por usuario en esta entrega. Correo incluye cliente, vigencia, SKU/nombre, porcentaje o USD/unidad y observaciones.

Nueva migración 202610220001_descuentos_correo.sql: tablas lote/avisos protegidas con RLS y sin acceso directo authenticated; catálogo de destinatarios y estado mediante RPC autenticados. Nuevo com_guardar_promocion_correo llama RPC original en la misma transacción y genera snapshot de tablas guardadas para cada destinatario seleccionado. Valida perfiles activos/email, máximo 50, deduplica ID/email, no genera avisos a otros usuarios. Preserva permisos originales de guardado Reportes/Administración. UUID solicitud + lock transaccional impiden duplicar promociones/avisos ante reintento idéntico; otro usuario o datos cambiados/mismo ID se rechazan. No cambió ni eliminó RPC antiguo. La pantalla nueva requiere instalar esta migración antes de publicar.

Edge Function descuentos-correo usa getUser + RPC de permiso antes del service_role. Adaptador Resend con secrets RESEND_API_KEY y DESCUENTOS_EMAIL_FROM, nunca VITE. Sin configurar devuelve pendiente; no confunde promoción guardada con correo enviado. Claim por estado/actualizado_en y clave idempotente por aviso, no reenvía ENVIADO. Reintentos limitados 23 h dentro de retención documentada 24 h del proveedor, y recuperación de ENVIANDO sólo después de diez minutos. Fuera de ventana requiere revisar proveedor; no reenvío ciego. ENVIADO sólo aceptación del proveedor, sin certificación de entrega/lectura ni webhooks. La invocación inicial ocurre desde app tras guardado: cerrar antes de invocación deja PENDIENTE para botón Reintentar; no cron de envío con app cerrada. Reintentar no guarda otro descuento.

Archivos: página DescuentosPromociones, repositorio promocionesRepository, migración nueva, función index/mensaje, dos pruebas y docs/CORREOS_DESCUENTOS.md (instalación SQL específico, repair sólo tras éxito, deploy función/secrets y frontend). No tocar módulos comerciales de visitas ni Dashboard ejecutivo/producción. No se descartan modificaciones locales previas; corresponden a commits ya guardados mediante conector en main aunque HEAD local siga cf158f4. Main remoto previo 8a8eb020d32f45fd29a5542b797e45e952790345.

Verificación: seis pruebas con múltiples casos: migración real y RPC original ejecutados en PGlite (atomicidad, rollback, permisos, no acceso directo, solicitud repetida, otro usuario y otros datos, destinatario inválido, correo duplicado); render mensaje; worker real transpila y ejecuta con cliente/proveedor simulados (sin permiso/secrets no contacta proveedor, no repite confirmado, clave estable, error y ventana, claim concurrente). Build frontend y diff sin errores. No prueba visual de navegador, configuración ni ejecución de Supabase/Cloudflare/Resend reales. No se envió correo real. Falta remitente elegido por Iván, dominio/servicio de correo configurado, instalar SQL, desplegar función y frontend, y prueba real autorizada. No afirmar que ya funciona en producción ni pasar sólo publicación frontend como activación suficiente.

### SMTP real de CIBUSPAN confirmado por Iván: 22/10/2026

Remitente papolo@cibuspan.com; Outlook es cliente IMAP/SMTP, no cuenta Microsoft 365. Captura image(20261022-172459).png muestra mail.cibuspan.com, SSL/TLS y autenticación obligatoria; Iván confirma puerto 465. Se agrega transporte SMTP en Edge Function descuentos-correo con Nodemailer npm:nodemailer@9, según ejemplo oficial Supabase. SMTP_HOST selecciona SMTP sin fallback Resend; SMTP_PORT sólo 465, secure:true, TLS>=1.2 y validación de certificado activa. SMTP_USER=papolo@cibuspan.com, DESCUENTOS_EMAIL_FROM igual; SMTP_PASSWORD se ingresa sólo en Supabase Edge Functions Secrets. No pedir que envíe contraseña al chat ni ponerla en repositorio o frontend. No se necesita cambiar correo que abre Outlook.

verify() comprueba conexión/auth antes de reclamar avisos. sendMail usa snapshot de la cola, destinatario confirmado, Message-ID estable por aviso y acceso a archivos/URL desactivado. Se marca ENVIADO sólo si SMTP acepta destinatario. SMTP no ofrece idempotencia del proveedor: primer intento incierto se bloquea para revisión administrativa sin reenviar automáticamente; marcador SMTP en proveedor_id impide reenvíos incluso si cambian configuración a Resend. Verificar trazas del servidor antes de resetear un intento incierto. El fallo de auth previo a claim conserva PENDIENTE sin consumir intento. Reintentos Resend con ventana 23h se mantienen separados. No prometer exactamente una entrega/lectura por Message-ID.

Cambios sólo función index, test worker, docs/CORREOS_DESCUENTOS.md y continuidad; no SQL adicional. Debe instalar la migración 202610220001 ya preparada, desplegar función y publicar frontend si aún no lo ha hecho. Pruebas worker siete casos (tres nuevos SMTP) pasadas con transporte simulado; SQL/mensaje dos casos anteriores conservados. Sin contraseña real, conexión SMTP de producción, deploy ni correo real. Falta configuración privada de secretos y despliegue; no afirmar que ya se envían mensajes. Main previo fced36f38042e499ed7cdbd0ff0f1ac358857d5b.

### Simplificar configuración SMTP para Iván: 22/10/2026

Iván recuerda que el agente hace el código en GitHub. Se dejan valores públicos predeterminados en Edge Function: mail.cibuspan.com, 465 TLS, usuario/remitente papolo@cibuspan.com. Basta agregar SMTP_PASSWORD en Supabase Edge Functions Secrets; otras cuatro variables opcionales sobrescriben predeterminados. No confundir contraseña con parámetros públicos ni pedir que la envíe por chat. El agente no tiene sesión Supabase/Cloudflare para guardar secretos o desplegar. Contraseña ausente no habilita SMTP ni anuncia envío; Resend alternativo mantiene su configuración explícita. Test adicional confirma flujo con sólo SMTP_PASSWORD simulado. Pruebas worker ocho casos pasados, build y diff correctos. No se ejecutaron correos reales. Falta SMTP_PASSWORD privado y la instalación/despliegue de migración/función/frontend; no crear otro descuento para probar.

### Pausa y auditoría de organización de la app: 23/10/2026

Iván pausa activación del correo mientras crean cuenta dedicada (se sugirió avisos@cibuspan.com; falta confirmar). Pide ordenar bloques/módulos, identificar duplicación, pantallas ubicadas en varios sitios, funciones pendientes y descartables, y seguimiento con diagrama. Considera otra app en paralelo como cambio de casa. Trabajo autorizado actual: revisión y propuesta, no rehacer ni mover menús todavía.

Nuevo documento docs/AUDITORIA_ESTRUCTURA_CIBUSPAN_ONE.md: inventario completo de 53 opciones de submenú y destino/estado, además de Inicio; 39 con componente y 14 PantallaEnConstruccion. Switch reconoce 89 alias/rutas, no 89 módulos. Siete grupos visibles abren mismo componente con mismos parámetros (Pedidos, Producción resumen/planificación/producción, Reportes bajo tres análisis, Inventario resumen/inventario, Kardex, Preparación/Despachos, Facturas/varias Finanzas). No interpretar accesos repetidos como datos duplicados. Historial producción tiene parámetros distintos y no se cuenta idéntico. Auditoría preliminar de navegación, no de DB ni validación funcional en vivo.

Propuesta: mismo proyecto/repositorio, evolución por módulos en entorno de ensayo con base/archivos/correos aislados; usuarios continúan en producción. No sistema nuevo independiente ni traslado manual de datos reales a copia que se desactualice. Siete bloques propuestos: Dirección, Comercial, Producción, Bodega y Despachos, Compras y Abastecimiento, Finanzas y Costos, Administración y Sistema. Dueño único por operación/dato; distinguir tablero ejecutivo, gestión del área y detalle. Preservar DashboardV2/costos por devengo y roles de pago en Finanzas conforme AGENTS. Propuesta requiere acuerdo de estructura antes de cambiar navegación.

Documento incluye hallazgos H01-H14 con fuentes, objetivos, dos diagramas Mermaid (flujo operativo y ciclo de aprobación), seguimiento ORG-01 a ORG-18 con prioridades/criterios, inventario de destinos en construcción, alcances/limitaciones, estrategia de prueba/publicación/reversión y siguiente revisión por roles/datos. No eliminar código legado sin dependencias/uso. No declarar capacidad ausente sólo por placeholder si aparece dentro de otro módulo. Separar correo programado de activado/publicado.

Se revisaron Layout/App/permisos y pantallas relacionadas, sin sesión en vivo ni consultas remotas de base. Main auditado dac28b1f68c5908ccc361266f50b222831433699. Sólo se agregan informe y esta continuidad; no cambios funcionales, SQL, ramas, entornos ni despliegues. Conteos contrastados con código y diff verificado; build frontend de control. La próxima fase es revisar el proceso pedido-producción-stock-despacho y el resto por rol, no arrancar nueva portada sin decidir procesos. No sustituir esta auditoría por otra app desde cero.

### Prompt de continuidad y autorización de inicio: 23/10/2026

Iván indica «ok, empecemos» y solicita archivo para arrancar otro chat sin perder contexto ni cambiar método, y explicación de utilidad de la auditoría. Podemos seguir en este chat; otro chat no crea por sí solo otra app/entorno ni garantiza continuidad. Se prepara docs/PROMPT_CONTINUIDAD_CIBUSPAN_ONE.md, válido para relevo ahora o después. Contiene repositorio/fuentes vigentes, mapa base, auditoría alcanzada y límites, reglas de programación/publicación/SQL, protecciones y pendientes de correo/operación/visitas.

Se toma mapa de siete bloques como base autorizada para comenzar revisión, con responsables/límites por precisar; ORG-02 actualizado y próxima tarea del informe cambiada a revisión pedido → planificación → producción/consumo → inventario/Kardex → despacho. No empezar masiva reescritura ni volver a pedir todo el contexto. Handoff pide matriz de proceso/roles/pantallas/tablas/RPC/movimientos/duplicaciones/pruebas y actualización ORG antes de mover interfaces. Continúa pendiente entorno de ensayo y validación en vivo. El pedido actual de archivo se completa sin hacer cambios funcionales.

Documento de auditoría es inventario y lista de control vivos para decidir conservar/reubicar/unificar/completar/retirar, ubicar tareas/indicadores y seguir aceptación/publicación por etapa; no es código de instalación ni certificado de módulo terminado. Prompt debe actualizarse cuando cambie la etapa, y el próximo chat leer main/AGENTS/continuidad/auditoría, no tomar este resumen fechado como autoridad por encima del código actual. Sólo documentación en este cambio. No despliegue ni SQL necesarios.

### Lista de control para Iván sin lenguaje técnico: 23/10/2026

Iván pide documento Word o PDF para ubicarse como usuario no programador y evitar desviaciones. Se entrega CIBUSPAN_ONE_Checklist_Proyecto.docx y CIBUSPAN_ONE_Checklist_Proyecto.pdf, cuatro páginas, guardados como documentos del usuario. Contenido: situación actual y siete etapas; primeras dos marcadas por auditoría de navegación y mapa base, etapa actual revisión del trabajo diario; checklist pedido-planificación-producción-existencias-despacho y criterios; mapa siete bloques y asuntos en pausa; hoja reutilizable por sesión con objetivo, resultado esperado, comprobaciones, pendiente, próxima tarea, responsable/fecha y nuevas ideas para después.

No marca funciones actuales como terminadas ni da por creado entorno de prueba. Correo dedicado pendiente y regularización histórica/sell-out quedan identificados para no desviar la revisión actual. Casillas Word se editan como texto, PDF para imprimir y marcar a mano. Estado fechado 23/10/2026, no seguimiento automático. Revisión visual de todas las páginas, PDF cuatro páginas y textos/fechas verificados. No cambios en app ni SQL/publicación. Conservar esta guía humana al lado del informe técnico, actualizarla al cierre de etapas y leerla al retomar, sin volver a la discusión de empezar desde cero. Los binarios no se duplican en el repositorio.

### Inicio de revisión funcional del circuito operativo: 23/10/2026

Iván indica «ok empecemos entonces». Se revisan pedido → planificación → producción/consumo → inventario/Kardex → preparación/despacho, sin modificar pantallas ni datos operativos. Base remota 033d3326516ccf92dfb252165fab95e3eb5b31ea. Nuevo docs/AUDITORIA_FLUJO_OPERATIVO.md contiene matriz de doce pasos con rol propuesto, pantallas/repositorios/tablas/RPC, cambios de existencias y decisiones; diagrama localizado, hallazgos OP-01 a OP-11 y diez pruebas operativas pendientes. ORG-06/07/08 actualizados; etapa 3 de guía humana sigue abierta.

Hallazgos: las funciones centrales obtener_produccion_sugerida/registrar_produccion_completa/editar_produccion_completa y FEFO no tienen definiciones SQL en el repositorio; no certificar consumos ni doble confirmación sin leerlas. Pedidos crea cabecera y detalles en dos solicitudes con borrado compensatorio no comprobado. Entrada manual de lote lee/suma/escribe sin token de solicitud. Histórico SQL pro_importar_ordenes_historicas guarda OP/consumos reportados para análisis sin escribir stock, y vistas combinan APP/HISTORICO con UNION ALL sin vínculo entre fuentes; no se probaron duplicados reales. UI anuncia cierre DESPACHADO para entrega parcial: política de faltantes requiere definición con Iván. Despacho llama activar_control_conciliacion_despacho, vincular_factura_despacho y confirmar_despacho_parcial_fefo por separado. Tablas de reserva reales en cliente: reservas_inventario y reserva_detalles. Preservar trazabilidad PT por delta y no duplicar asiento manual. Nunca repetir inicio de octubre como prueba o solución de interfaz.

Sin sesión real de Supabase disponible, se prepara consulta de sólo lectura supabase/diagnosticos/auditoria_flujo_operativo.sql. Exporta únicamente metadatos de funciones operativas/de triggers, columnas, restricciones, índices, vistas y políticas; incluye reservas_inventario, catálogos y definiciones de fórmulas, sin filas de negocio. scripts/Exportar-AuditoriaOperativa.ps1 usa proyecto ya vinculado y JSON del CLI, detecta nombre de bandera en ayuda y valida respuesta no vacía. Genera auditoria_flujo_operativo_FECHA_HORA.json fuera de Git (.gitignore). No es migración: no repair, build ni despliegue para consultarla. PowerShell real no disponible aquí; no afirmar ejecución en Windows/Supabase reales.

Verificación local: prueba nueva ejecuta consulta dentro de BEGIN READ ONLY con funciones/triggers/vistas/RLS de ensayo, comprueba ausencia de dato privado centinela y conservación de filas. Junto con pruebas SQL del Kardex versionado: 17 casos pasan, reservas simuladas (no certifican FEFO instalado). npm run build correcto; sólo advertencia de tamaño de chunks. Diff revisado. Actualizado prompt de relevo para retomar con el JSON del servidor y no repetir auditoría desde cero. No cambios funcionales ni publicación. Siguiente paso: Iván ejecuta el exportador tras git pull y adjunta JSON; leer definiciones y completar OP-01 antes de adaptar guardado transaccional de pedidos. No avanzar a rediseño masivo del menú.

### Diagnóstico del servidor recibido y contrastado: 23/10/2026

Iván adjunta Texto pegado(2).txt con JSON completo: 30 funciones, 39 objetos y 181 políticas, generado 2026-10-23T16:05:48.327229+00:00; SHA-256 971175f50c90e917499b7563207cb3617a9022395e378806e73cdc27a435cbed. No volver a pedirlo ni reiniciar auditoría de código. Se leyeron las funciones base reales exportadas y sus triggers. Nuevo docs/RESULTADO_REVISION_OPERATIVA_20261023.md; informe original, ORG-06/07/08 y prompt actualizados. Etapa 3 permanece abierta.

Resultados confirmados: registrar/editar producción no aplica consumos MP ni llama recetas; triggers asociados tampoco. Registrar es transaccional y revierte ante detalle inválido, pero reenviar mismo payload genera otra producción y suma nuevamente PT. Histórico instalado sólo analítico y sus tablas sin triggers. Pedidos no tiene índice único de numero_pedido_cliente, sólo PK id. Preparar/liberar conserva físico; confirmar descarga PT una sola vez por reserva y segundo intento se rechaza. Parcial cierra DESPACHADO y excluye faltante de planificación. Factura/conciliación son pasos previos separados que permanecen si falla confirmar. Stock mínimo no se usa en la fórmula. No se consultaron movimientos/saldos/documentos reales ni se afirman duplicados existentes.

Pruebas nuevas en pruebas/verificar_flujo_servidor_exportado.mjs: nueve escenarios de caracterización de cuerpos exportados en PGlite; resultado conjunto con diagnóstico/Kardex 27 pruebas pasan. Incluyen reproducción de defectos, no su reparación. Defaults y usuario/permisos de prueba son modelados; vista auxiliar de resumen semielaborados vacía. No certifican concurrencia, HTTP, RLS completo ni operación real. Exportado v1 omite defaults, FORCE RLS, grants de tabla y tipo PERMISSIVE/RESTRICTIVE; no concluir apertura de todas las políticas por coexistencia. Acentos presentan conversión de consola: no desplegar una normalización adivinada como SQL.

El repositorio es público. No se publica exportado completo ni prueba específica de autorización. Evidencia privada y relevo conservados en CIBUSPAN_ONE_Revision_Operativa_Privada_20261023.zip; resumen humano separado CIBUSPAN_ONE_Avance_Revision_Operativa_20261023.pdf. El test público requiere CIBUSPAN_AUDIT_FILE apuntando al JSON/TXT privado; no contiene fixture real en Git. OP-12 registra autorización de operaciones prioritaria, con detalle en informe privado y sin evidencia de abuso. No se modificaron accesos durante la auditoría.

Siguiente trabajo delimitado: cerrar autorización operativa sin romper procesos internos autorizados, después proteger reintentos de producción; luego consumo MP y pedido transaccional. Validar con Iván qué ocurre con faltante parcial, alcance de numeración y reposición por mínimo antes de cambiar esas reglas. No rehacer menú, crear otra app ni ejecutar inicio de octubre. No hay migración correctiva, publicación ni cambios de app/datos en esta revisión. npm run build y diff de control correctos; ensayo privado también completado, sin llamadas reales. PDF de dos páginas revisado visualmente y paquete ZIP íntegro. Actualización de guía humana al cierre de etapa, que aún no se completó.

### OP-12 programado: autorización operativa preparada para instalar, 23/10/2026

Iván autoriza «ok sigamos». Base remota 57981460d030005a24e216a47b67b483c9bbd015. Se implementa exclusivamente el primer cambio acordado: migración nueva 202610230001_autorizacion_operativa.sql, helper app_exigir_operacion(text[]), verificación de sólo lectura supabase/diagnosticos/verificar_autorizacion_operativa.sql e instalador scripts/Instalar-AutorizacionOperativa.ps1. No se cambian pantallas, navegación, existencias, filas de permisos ni reglas de fabricación/entrega.

Doce firmas exactas: registrar/editar producción, reservar/confirmar/liberar, activar conciliación/vincular factura, ajustar lote/convertir empaque/convertir semielaborado, registrar devolución y consultar producción sugerida. Retira EXECUTE PUBLIC/anon y conserva/granta authenticated/service_role. Exige UID, perfil activo por user_id y app_puede_alguna con módulos acordes a controles anteriores. Excepción para rol SQL real service_role y mantenimiento SQL privilegiado (incluido login temporal con SET ROLE postgres); no confía en texto de claims ni usa current_user dentro de SECURITY DEFINER. Conserva controles internos originales, incluso requisitos adicionales que ya tuvieran los procesos. No se cambió el trigger general de escritura ni se promete cobertura de todas las funciones de la app.

La migración toma pg_get_functiondef/prosrc vigentes en servidor y envuelve íntegro el bloque PL/pgSQL con control anterior a DECLARE/BEGIN/EXCEPTION, preservando OID, firma, defaults, seguridad y configuración; no pega el SQL exportado con acentos convertidos. La consulta SQL de obtener_produccion_sugerida se conserva con RETURN QUERY EXECUTE en PL/pgSQL y habilita Producción/Reportes/Dashboard. Si falta contrato, hay variantes no revisadas, marcador incompatible o permisos no verificables, revierte toda la transacción. Reinstalar no anida controles ni ejecuta negocio. Soporta CRLF de checkout Windows.

Instalador aplica sólo ese SQL nuevo, obtiene JSON de verificación y exige correcto=true/versión correcta antes de migration repair 202610230001 --status applied --linked. No db push del historial, npm ci, Wrangler ni nueva publicación frontend. Fallos de instalación/verificación/repair se distinguen en sus mensajes. PowerShell real y Supabase real no ejecutados desde este entorno; falta resultado de Iván para afirmar instalación. El proyecto vinculado debe ser el mismo que entregó el diagnóstico. Mensaje final esperado: «Protección instalada y verificada en las 12 funciones operativas.»

Pruebas: verificar_autorizacion_operativa_sql.mjs verifica sesión, módulo, perfiles inactivos/sin perfil, roles sin acceso, claims que no sustituyen rol SQL, Dashboard sólo lectura, mantenimiento/service_role legítimos, contratos y fuente anterior intactos, declaración/excepción interior sin eludir control, rollback completo ante contratos ausentes/variantes/marca falsa, reinstalación y CRLF, diagnóstico READ ONLY y detección de grants cambiados. verificar_flujo_servidor_exportado.mjs suma modo CIBUSPAN_PROBAR_AUTORIZACION=1 para aplicar la corrección a los doce cuerpos exportados en PGlite y conservar el recorrido real ensayado; archivo privado vía CIBUSPAN_AUDIT_FILE, no se publica. Escenario conserva defaults/auxiliares de ensayo, no certifica HTTP, concurrencia ni todos los roles reales. Con diagnóstico/Kardex, 46 pruebas pasan. npm run build correcto y diff sin errores.

Documentación actualizada: docs/AUTORIZACION_OPERATIVA.md, resultado de revisión, seguimiento ORG-16 y prompt de relevo. Etapa 3 sigue abierta. OP-13 (reintento duplica fabricación), consumo MP, pedido transaccional y decisiones de parcial/numeración/stock mínimo continúan pendientes: no confundir este control de acceso con deduplicación. Siguiente paso: Iván instala y devuelve terminal; confirmar estado y continuar con solicitud estable para producción. Cualquier nueva firma/reemplazo de esa función debe mantener esta autorización y actualizar su verificación; nunca reinstalar un cuerpo viejo que quite las protecciones. No se aplicó SQL ni se publicó app en producción desde aquí.


### OP-12 instalado y OP-13 preparado: registro de producción seguro, 23/10/2026

Iván devuelve terminal del instalador de autorización: consulta superada, repair 202610230001 aplicado y mensaje de doce funciones protegidas. OP-12 instalado y verificado por metadatos reales; no equivale a recorrido HTTP con todos los usuarios. El aviso CLI 2.122.0 disponible no impidió instalar. No actualizar dependencias ni reinstalar sólo por ese aviso. El texto Protección aparece con conversión de consola; no demuestra daño del SQL.

Se continúa el siguiente cambio delimitado OP-13 sobre main 4aef964885528cf70fd481ba6cb598e82e5eb7b2. Nueva migración 202610230002_registro_produccion_seguro.sql crea comprobante privado por UUID/actor/payload y los RPC registrar_produccion_segura/resolver_registro_produccion. Guarda solicitud y fabricación en una transacción, serializa por clave, devuelve mismo ID sin segundo incremento PT/Kardex. Distintas solicitudes permiten fabricaciones reales iguales; no deduplicar por SKU/día. Resolver sella la ausencia como ANULADA bajo mismo bloqueo: una petición atrasada ya no puede crear después de permitir corregir. Error revierte todo. Sesión esperada, permiso Producción y rol SQL real conservados. Tabla RLS y auxiliares privados sin acceso de roles API; nuevas APIs sin anon/PUBLIC.

Conserva cuerpo/OID/firma/defaults de registrar_produccion_completa y prefijo OP-12; añade comprobación privada inmediatamente después de autorización. Llamada antigua sin solicitud y GUC inventado no bastan. Reinstalar OP-12 u OP-13 conserva ambas protecciones y comprobantes; CRLF probado. No copiar cuerpo del exportado ni retirar la autorización. No hay fallback al RPC antiguo.

Cliente: src/utils/registroProduccionSeguro.ts guarda copia antes de enviar en localStorage por proyecto/usuario/UUID. Bloquea clics y nuevas fabricaciones con intento incierto; conserva el mismo payload para reintentar tras recarga. Recupera respuesta perdida automáticamente; si no puede, muestra Reintentar registro o Comprobar para corregir. Resultado cerrado permite restaurar edición si catálogo sigue disponible. Fallo de lectura del historial o limpieza local no convierte confirmación en fallo de fabricación. Cambios en ProduccionV2 y repositorio sin alterar planificación, destinos, edición ni lotes. No borrar almacenamiento/cambiar equipo para resolver incertidumbre; pérdida de clave requiere revisar historial. No detecta duplicados anteriores ni reingreso manual con clave nueva.

Instalador scripts/Instalar-RegistroProduccionSeguro.ps1: compila primero, aplica sólo SQL 202610230002, valida JSON/versión/correcto del diagnóstico de cinco controles, repair sólo esa versión y publica dist en Cloudflare cibuspan-one/main. ASCII para Windows PS5.1. Requiere SQL y frontend juntos; app antigua al guardar pide actualizar. Si SQL termina pero falla un paso posterior, terminar el paso pendiente sin quitar control ni registrar otra fabricación para probar. No npm ci, db push, migraciones antiguas ni movimientos de prueba. Pendiente de ejecución real por Iván; no declarar instalado/publicado sin terminal.

Ensayo local: pruebas de utilidad cubren persistencia, doble clic, respuesta perdida, recarga, cierre, cambios de payload, corrupción/cuota, limpieza fallida, aislamiento y mapeo. CIBUSPAN_PROBAR_REGISTRO=1 en verificar_flujo_servidor_exportado.mjs aplica ambas migraciones a cuerpos exportados privados y comprueba repetición, despacho intermedio, rollback, identidad/permisos/service_role, bypass antiguo bloqueado, cierre sellado y reinstalación. Verificador READ ONLY y grants alterados probados. CIBUSPAN_AUDIT_FILE requiere TXT/JSON privado, no subirlo a Git. PGlite es secuencial con dependencias de ensayo; no certifica concurrencia entre conexiones, HTTP ni todos los RLS/usuarios reales. Resultado conjunto autorización/flujo/registro/diagnóstico/Kardex: 69 pruebas pasan; npm run build correcto, sólo advertencia de tamaño de chunks. Documentado en docs/REGISTRO_PRODUCCION_SEGURO.md; no se hizo prueba visual ni ejecución Windows remota.

Siguiente paso: Iván ejecuta instalador OP-13 y devuelve terminal; comprobar instalación, registro y publicación. Después definir/completar consumo MP, recordando que las cantidades reales históricas provienen de OP y las recetas pueden estar desactualizadas. Pedido transaccional y decisiones de parcial/numeración/stock mínimo siguen pendientes. Etapa 3 abierta. No rehacer auditoría ni menú, iniciar otra app, reiniciar octubre o reimportar inventario.


### OP-13 instalado, verificado y publicado: resultado recibido el 23/10/2026

Iván adjunta Texto pegado(3).txt con terminal completa de Instalar-RegistroProduccionSeguro.ps1. Confirma git pull 4aef964 → d12e18b, npm run build correcto, verificación SQL superada (el script exige JSON/versión/correcto=true antes de continuar), migration repair 202610230002 aplicado y publicación Cloudflare https://4e741568.cibuspan-one.pages.dev. Subió 66 archivos, 21 ya existían. Mensaje final: Registro seguro de produccion instalado, verificado y publicado. OP-12 y OP-13 instalados/verificados, frontend OP-13 publicado. No volver a pedir ese resultado ni reinstalar por los avisos de versión de Supabase/tamaño de chunks. Wrangler avisó cambios locales, sin bloquear: no conocemos su contenido; no descartarlos automáticamente.

Este resultado confirma instalación y despliegue, no aceptación del usuario ni prueba HTTP concurrente en vivo. No se consultaron saldos ni se registró producción de prueba desde aquí. Cerrar y abrir la app para usar cliente nuevo; no reingresar fabricaciones previas como prueba. Mantener guard OP-12 y comprobante/cierre sellado OP-13. Los duplicados anteriores y reingresos con una clave nueva no se corrigen retroactivamente.

Se actualizan documentos de registro seguro, autorización, resultado de revisión, seguimiento ORG-06 y prompt de relevo; cambio de documentación únicamente, sin SQL/frontend nuevos que instalar/publicar. Siguiente tarea: definir/completar consumo MP (OP-07), usando cantidades reales cuando existan y sin aplicar recetas actuales automáticamente a históricos. Después pedido transaccional; reglas de parcial/numeración/stock mínimo pendientes. Etapa 3 permanece abierta y falta validación operativa por usuarios. No rehacer auditoría, menú ni inicio de octubre.


### OP-07 de nuevas fabricaciones preparado: consumo MP conjunto, 23/10/2026

Iván autoriza «listo, dale» al descuento MP al registrar una producción. Base remota 728543fc55c781abc8859a3e57987d97042e64b0. OP-12/OP-13 instalados/verificados y OP-13 publicado; no volver a pedir sus terminales. Se programa alcance diario nuevo, no regularización automática de octubre. docs/CONSUMO_MP_PRODUCCION.md detalla implementación, límites, instalación y pruebas. Código preparado/probado; SQL 202610230003 y frontend pendientes de instalar/publicar por Iván.

Nueva tabla pro_consumos_detalle y trigger privado AFTER UPDATE OF estado en pro_solicitudes_registro para REGISTRANDO → CONFIRMADA. Comprueba actor, transacción y autorización Producción; valida declaración por detalle, UUID/material, unidad vigente, cantidad positiva hasta seis decimales (entera en UNIDAD), fecha no futura y posterior a saldo inicial. Adquiere en orden los mismos advisory locks que Kardex MP; escribe SALIDA y conserva snapshot/referencias a movimientos. inv_kardex_validar_mp comprueba toda la secuencia, incluidas fechas posteriores. Cualquier fallo revierte solicitud, fabricación, PT/semielaborado, MP y Kardex juntos. Repetición confirmada no dispara otra vez; distintas fabricaciones legítimas sí consumen cada una. No se copian/reemplazan cuerpos OP-12/OP-13 y sus reinstalaciones conservan el trigger nuevo.

Cliente: ConsumosProduccion en confirmación de ProduccionV2, propuesta ajustable desde recetas y catálogo de Kardex, alta/quita manual y confirmación por SKU. Comparator reutilizado devuelve UUID y marca de empaque sin cambiar los cálculos del comparador histórico. Un fallo de receta permite ingreso real manual; fallo de catálogo impide confirmar sin datos. No se inventan cantidades de componentes no vinculados ni densidades KG/L; empaques fraccionados deben corregirse al uso real. Un micro preparado se consume como material sin repetir sus ingredientes; entradas por preparación de micros continúan desde Kardex. Semielaborado no propone empaque hasta etiquetar; esa salida de empaque sigue siendo explícita desde Kardex. Sin consumo inventariable requiere motivo >=10 caracteres y confirmación, conservados como declaración humana.

El payload opcional consumoMp mantiene compatibilidad de recuperación de solicitudes antiguas; para una fabricación nueva el trigger exige declaración. Copia, validación y mapeo preservan el consumo/versiones con el mismo UUID antes de enviar. Cambio de datos invalida la confirmación; no se recalcula un consumo real silenciosamente al cambiar unidades. Volver a calcular con receta es explícito. Para pendientes antiguos sin consumo, recuperar usa comprobar/cerrar antes de restaurar edición; confirmados previos no reciben consumos retroactivos. Historial muestra declaración y movimientos por SKU/fecha/unidades al registrar; ausencia en una fabricación vieja no se presenta como cero. RegistroProduccionNoGuardadaError distingue rechazo con cierre confirmado de incertidumbre: al recuperar se restaura edición si los SKU siguen disponibles; el catálogo se consulta antes de intentar/cerrar cuando se entra desde historial.

Editar rendimiento, fecha o lote conserva consumos reales declarados; no vuelve a multiplicar recetas ni a descontar. Correcciones de consumo se hacen con movimientos compensatorios en Kardex y motivo/referencia; declaración original se conserva. Futura conciliación debe incluir esos ajustes. No se anuncian consumos históricos conciliados ni automatización de empaques al etiquetar, preparación de micros o edición integral de declaraciones. No tocar saldos iniciales, reingresar fabricación, reiniciar octubre ni aplicar recetas vigentes automáticamente sobre OP pasadas. La fecha física y cantidades reales de OP siguen siendo las fuentes del histórico.

Instalador scripts/Instalar-ConsumoMpProduccion.ps1: compila antes de SQL, aplica sólo 202610230003_consumo_mp_produccion.sql, comprueba diagnósticos de autorización/registro/consumo con JSON/versiones/correcto=true, repair sólo nueva versión y publica Cloudflare cibuspan-one/main. No npm ci/db push ni migraciones antiguas. Requiere proyecto ya vinculado y frontend nuevo; versión antigua sin consumos recibe rechazo sin cambios de stock. Si SQL termina pero falla otro paso, terminar pendiente sin retirar controles ni repetir fabricación. Falta terminal real para confirmar instalación y publicación. No se ejecutó SQL/Cloudflare desde aquí.

Verificación: 102 pruebas pasan en conjunto autorización, flujo exportado, registro/consumo cliente, diagnóstico, Kardex y comparación OP. Incluye atomicidad, rollback total por falta MP, dos SKU/material compartido, semielaborado, unidades G/UNIDAD, fechas/cierre, saldo posterior negativo, permisos, RLS de consumo, service_role, rendimiento sin recalcular lo real, recuperación antigua y reinstalación CRLF. Diagnóstico READ ONLY detecta trigger deshabilitado. PGlite usa exportado privado vía CIBUSPAN_AUDIT_FILE/CIBUSPAN_PROBAR_CONSUMO=1 y CIBUSPAN_SQL_TEST_MODULE; defaults/auxiliares de ensayo modelados. Para edición de rendimiento se modelan tablas vacías de auditoría/despacho/empaque; no certifica cambios de identidad ni HTTP/concurrencia real o todos los RLS. No publicar el diagnóstico privado. npm run build correcto, sólo aviso de tamaño de chunks; sin prueba visual ni aceptación operativa en vivo.

Siguiente paso: Iván instala/publica con Instalar-ConsumoMpProduccion.ps1 y devuelve terminal; comprobar sólo paso pendiente antes de declarar éxito. Después regularizar consumos históricos con evidencia real e identificar automatización de empaque/micros pendiente; luego pedido transaccional. Reglas de parcial/numeración/stock mínimo y validación por usuarios pendientes. Etapa 3 abierta, menú y otras ideas en pausa.


### OP-07 diario instalado, verificado y publicado: resultado recibido el 24/10/2026

Iván adjunta Texto pegado(5).txt con ejecución completa de scripts/Instalar-ConsumoMpProduccion.ps1. Confirma git pull d12e18b → f11fe8a, build correcto (281 módulos), las tres verificaciones de autorización/registro/consumo aceptadas por el instalador, migration repair 202610230003 aplicado y publicación https://7faeb857.cibuspan-one.pages.dev. Subió 67 archivos y 21 ya existían. Mensaje final: Consumo MP instalado, verificado y publicado; autorizacion y reintentos conservados. OP-12/OP-13 conservados y OP-07 del alcance diario instalado/verificado/publicado. No pedir otra vez ese resultado ni reinstalar por los avisos de CLI/chunks. El aviso de cambios locales de Wrangler no bloqueó; no se inspeccionaron esas diferencias ni se deben descartar automáticamente.

Esto confirma instalación, verificación por metadatos y publicación, no aceptación de producción real ni prueba concurrente HTTP en vivo. Cerrar/abrir la app antes de registrar una fabricación nueva real, revisar cantidades sugeridas y confirmar el consumo por SKU. No reingresar producciones anteriores como prueba. No se consultaron saldos ni se hicieron fabricaciones de prueba desde aquí. No hay más comandos pendientes para instalar/publicar este alcance.

Se actualizan documentos de consumo, registro seguro, resultado, seguimiento ORG-06 y prompt de relevo; sólo documentación, sin otra migración/publicación requerida. Etapa 3 abierta. Siguen pendientes consumos históricos, conciliación de existencias, preparación/entrada de micros y empaque al etiquetar semielaborados, pedido transaccional y decisiones de parcial/numeración/stock mínimo. Siguiente trabajo: preparar una vista previa/conciliación de consumos históricos usando cantidades y fechas físicas reales de OP e identificando movimientos/ajustes ya aplicados. No escribir saldos ni crear PT/MP durante esa preparación, no aplicar recetas actuales al pasado ni volver a ejecutar inicio de octubre. La propuesta debe ser concreta y revisable antes de aplicar la regularización según alcance revisado. Leer los documentos actuales y aprovechar importaciones existentes; no repetir auditoría ni pedir archivos sin consultar las fuentes disponibles.


### Cambio de prioridad de Iván: arranque con corte físico y pedidos al día, 24/10/2026

Tras confirmar consumo MP instalado/publicado, Iván indica que para arrancar en vivo prefiere cargar los inventarios físicos de ese momento y partir desde ahí; por ahora sólo considera actualizados los pedidos. Se registra en docs/ARRANQUE_OPERATIVO.md y se actualizan seguimiento ORG-06/07, prompt y próximo paso de consumo MP. La reconstrucción desde el 1 de octubre queda en pausa, no es condición para el arranque diario de producción y bodega. No confundir despliegue web con fecha física de inicio; fecha/hora y conteo concreto aún no definidos.

Durante preparación continuar pedidos y conservar sus registros; verificar los realmente pendientes, reservas y disponibilidad antes del corte. No tratar saldos anteriores como existencias actuales verificadas para prometer o planificar. Contar MP/empaques/micros inventariables/semielaborados/PT, con unidades e identificaciones reales; un artículo no contado no es cero. Preparar vista previa de saldo anterior, conteo y diferencia, trazabilidad y límite temporal que impida que movimientos previos alteren el saldo físico aprobado. No sumar el conteo como compra, cargar otro SALDO_INICIAL a ciegas, borrar historial, eliminar lotes ni repetir inicio de octubre. Esta propuesta no autoriza aplicar cifras desconocidas o resetear la base. Históricos se conservan como no conciliados; si se completan después, no deben duplicar efectos sobre el nuevo período.

Sólo se cambió documentación/plan en esta entrega: no SQL, interfaz, saldos ni bloqueos de módulos. OP-12/OP-13 y consumo MP instalados se mantienen. La indicación por ahora pedidos no desactiva visitas ni otros módulos en uso. Faltan fecha/hora elegidas, conteo físico y desarrollo/verificación de la apertura trazable antes de aplicarla. Siguiente entregable: corte de arranque preparado y revisable. Etapa 3 abierta; pedido transaccional y empaque/micros pendientes. Los próximos chats deben seguir esta prioridad y no retomar automáticamente la regularización histórica.


### Módulo de arranque físico implementado, 24/10/2026; pendiente instalación y conteo

Iván responde que no conoce aún la fecha: será cuando este módulo esté listo, y autoriza seguir programando. No volver a pedir fecha para continuar ni regresar automáticamente a consumos históricos. Ver docs/ARRANQUE_OPERATIVO.md actualizado con funcionamiento, instalación, evidencia y límites.

Se añade Kardex > Preparar arranque, utilitarios de conteo/importación y control persistente de solicitudes, repositorio y migración única 202610240001_arranque_operativo.sql. Borrador sin fecha obligatoria; manual/Excel MP/PT y semielaborados manuales, no contado distinto de cero, códigos sin ceros si únicos, incidencias resueltas expresamente, lotes/fechas reales sin inventar. Vista previa READ ONLY con cambios, pedidos/reservas; catálogo/stock/pedidos cambiados invalidan el token. Fecha al confirmar: hoy o mañana en Ecuador, inventario al cierre anterior, sin operaciones físicas pendientes entre ambos.

Aplicación sólo administrador activo, confirmaciones humanas, una sola apertura, comprobante por UUID, misma solicitud recupera sin duplicar y resolver ausencia sella llegadas tardías. Guarda respaldo privado de estado anterior/entrada/resultado. Ajusta MP por diferencia, PT físico más residual de Kardex si necesario y semielaborados conservando conversiones. No borra historial, altera pedidos ni reejecuta inicio de octubre. Frontera de servidor protege stock contra registros previos, identidades de lotes contados y cambios retroactivos; si inicio mañana, stock se cierra hasta el inicio, pedidos siguen. Nuevo material recibe saldo inicial cero compatible con protección vieja de septiembre. Envolturas preservan definiciones instaladas originales; OP-12/13/07 conservados. Historial anterior no conciliado; costos no revalorizados, semielaborados/empaques/micros aún tienen límites operativos documentados.

Instalador scripts/Instalar-ArranqueOperativo.ps1 compila, aplica sólo SQL nuevo, exige los cuatro diagnósticos de metadatos con tipo/versión/correcto booleano, repair sólo 202610240001 y publica cibuspan-one/main. Instalar NO aplica corte ni conteos. Todavía no hay terminal de instalación/publicación de este módulo ni inventario real aplicado. No afirmar publicado por el commit. Después instalar, preparar conteo, revisar previa y confirmar sólo cuando esté listo.

Pruebas locales del cliente y de SQL exportado aislado verifican cobertura/unidades/lotes, importación sin sumar, recuperación/doble clic/recarga/almacenamiento, atomicidad, conservación de pedidos, reservas, período cerrado, stock MP histórico negativo, residual PT, conversiones, archivos/lotes nuevos, rollback tardío y reinstalación CRLF. Diagnóstico sólo metadatos detecta trigger deshabilitado y permiso anónimo. 92 pruebas de la entrega pasan (57 SQL exportado + 35 cliente/registro de producción), build TypeScript/Vite/PWA correcto. No hubo prueba de navegador/HTTP concurrente ni escrituras de stock en vivo. Preservar el dump privado fuera del repositorio. Etapa 3 abierta; pedido transaccional y automatizaciones de empaque/micros siguen pendientes.


### Arranque físico instalado, verificado y publicado: terminal recibida el 27/10/2026

Iván confirma el 27/10/2026 la terminal final del instalador: publicación https://10e6b372.cibuspan-one.pages.dev y mensaje «Modulo de arranque instalado, verificado y publicado. No se aplico ningun conteo». La salida coincide con scripts/Instalar-ArranqueOperativo.ps1, que exige compilación correcta, aplicación sólo de SQL 202610240001, cuatro verificadores de autorización/registro/consumo/arranque, registro de la nueva versión y despliegue antes del mensaje final. Esto confirma instalación y publicación; no prueba conteo real, aceptación de usuarios o concurrencia HTTP. La terminal compartida no muestra git log; no atribuirle un SHA de compilación no mostrado. No pedir reinstalar ni la misma terminal otra vez. Los controles previos se conservan.

No se aplicó conteo ni se acordó fecha de inicio. Siguiente paso: cerrar/abrir la app, administrador en Kardex > Preparar arranque, preparar conteo real MP/empaques/micros/PT/semielaborados y conservar borrador descargado; elegir fecha cuando esté listo, resolver reservas/pedidos, revisar la previa y confirmar una sola vez. No inventar cifras/fechas, repetir importación inicial de septiembre o regularizar producciones antiguas sobre el stock nuevo. Pedidos continúan al día. Histórico en pausa. Después seguir pedido transaccional y pendientes de empaque/micros; etapa 3 abierta.

Esta entrega actualiza sólo documentación y seguimiento. No hay SQL/frontend nuevos ni otra publicación requerida por estas notas.


### Tema marcado para más adelante: arranque de inventarios, 27/10/2026

En pausa por indicación de Iván (27/10/2026): arranque de inventarios, seguimiento ORG-07. El módulo ya está instalado, verificado y publicado (Cloudflare 10e6b372). Quedan pendientes conteo físico real, fecha de inicio, revisión de pedidos/reservas, vista previa y confirmación del corte. No se aplicó ningún conteo. Retomar sólo cuando Iván lo indique; frase de referencia: «Retomemos el arranque de inventarios». Sin fecha ni recordatorio programado. No reinstalar ni volver a pedir la terminal confirmada. Los pedidos continúan al día.

Esta indicación posterior suspende el siguiente paso de conteo/aplicación descrito arriba; no reanudarlo automáticamente por ver el módulo instalado. Mantener el estado en el prompt y seguimiento estructural. No modifica SQL, interfaz, saldos ni controles; no requiere comandos del usuario ni otra publicación.


### Siguiente paso autorizado: alta completa y recuperación de pedidos, 27/10/2026

Iván indica «OK SIGAMOS CON EL PASO QUE VIENE» tras marcar ORG-07 (conteo/arranque físico) en pausa. Se avanza OP-02, no se reanuda el conteo ni la regularización histórica. docs/REGISTRO_PEDIDOS_SEGURO.md contiene el alcance actual, instalación, reglas y límites. Código/SQL preparados y probados; instalación/verificación/publicación de 202610270001 todavía pendientes de terminal real. No confundir con el arranque ya instalado/verificado/publicado en 10e6b372, que no requiere reinstalarse.

Nuevas APIs registrar_pedido_seguro(uuid,jsonb,uuid) y resolver_registro_pedido(uuid,uuid), tabla privada ped_solicitudes_registro y guardias BEFORE INSERT en pedidos/pedido_detalles. Alta y detalle se guardan en la misma transacción con comprobante por UUID/actor. Error de detalle revierte todo; repetición confirmada no duplica y ausencia sellada rechaza llegadas tardías. Usuario esperado/perfil/permisos Pedidos/Despachos verificados; tabla con RLS y sin API directa, helpers privados y APIs sin anónimo. GUC falso no sustituye la prueba privada de misma transacción/actor/payload. Se conserva mantenimiento SQL autorizado sin UID; APIs de alta requieren responsable real. No se reemplazan cuerpos de producción/despacho ni políticas existentes.

Interfaz manual e importaciones usa el mismo controlador persistente, copia antes de envío, doble clic compartido y panel de intentos inciertos recuperables entre recargas. Bloquea nuevas altas mientras no se compruebe el intento. Importación confirma cada orden separadamente y se detiene ante incertidumbre, conservando anteriores y siguientes sin reenviar todo el lote. Comprobar permite cierre y restaurar datos para corregir; verifica catálogo antes de restauración, no omite líneas faltantes y permite descargar copia. Un borrador normal no enviado no se guarda automáticamente; después de cerrar intento, descargar/restaurar antes de salir si se necesita esa corrección. Si refrescar la lista falla tras confirmar, informa éxito conocido; no trata ese fallo como alta fallida.

Mantiene alcance global del número que ya comprobaba la interfaz, con trim/mayúsculas y bloqueo por número; comparación literal evita comodines ILIKE. No añade índice único sobre datos reales ni deduplica pedidos antiguos. Cambiar numeración a por cliente sigue siendo decisión OP-03 pendiente. Distintos números en bodega/fecha iguales siguen permitidos con advertencia de la interfaz. ID interno nuevo PED-fecha-UUID evita dependencia de reloj del cliente; número del cliente intacto. Comprobante conserva ID aun si un pedido INGRESADO se elimina por flujo existente: vigente=false al reintentar y no se recrea. La eliminación en varios pasos aún requiere revisión transaccional propia; no declararla resuelta por el alta nueva.

Instalador scripts/Instalar-RegistroPedidosSeguro.ps1 compila antes de SQL, aplica sólo 202610270001_registro_pedidos_seguro.sql, exige los cinco diagnósticos de autorización/producción segura/consumo/arranque/pedidos, repair sólo nueva versión y publica cibuspan-one/main. No db push, migraciones históricas, dependencias nuevas, reimportaciones ni stock. Si SQL termina pero publicación falla, completar Cloudflare y refrescar cliente antes de continuar; el cliente viejo queda bloqueado para altas separadas. No retirar controles ni ingresar pedidos de prueba en vivo.

125 pruebas locales de la entrega pasan (71 escenario SQL exportado + 54 cliente/parsers/regresión), build TypeScript/Vite/PWA correcto. Incluyen controller y validación, doble clic, respuesta perdida, recarga, cierre sellado, respuestas ajenas, borrado sin resurrección, almacenamiento lleno/corrupto/limpieza fallida y sesiones/proyectos aislados. SQL aislado sobre exportado privado del 23/10 (cliente_productos del mismo esquema añadido al ensayo) verifica atomicidad/rollback tardío, catálogo/unidades/cantidades, alcance global conservado, permisos, GUC falso, comprobante conservado, cero cambios de stock, integración con arranque cerrado y reserva/despacho FEFO posterior. Diagnósticos sólo metadatos conservan los cinco contratos y detectan trigger deshabilitado; reinstalación CRLF conserva pedidos. No se hizo prueba visual de navegador, HTTP concurrente ni altas en la base real; PGlite modela defaults/auxiliares y no equivale a concurrencia PostgreSQL real. No publicar el dump privado.

Siguiente: Iván instala/publica con el instalador nuevo y devuelve la terminal; registrar únicamente ese resultado y validar operación real. Después continuar revisión de eliminación/recuperación de despacho y decisiones de parcial/numeración/stock mínimo sin anticiparlas. Etapa 3 abierta; preparación de micros/empaque al etiquetar pendientes; histórico y conteo/corte físico siguen EN PAUSA.

### Pedidos OP-02 instalado, verificado y publicado: resultado recibido el 27/10/2026

Terminal recibida de Iván el 27/10/2026: https://fbafd456.cibuspan-one.pages.dev y mensaje «Registro seguro de pedidos instalado, verificado y publicado. No se importaron pedidos ni se cambio stock». Corresponde a scripts/Instalar-RegistroPedidosSeguro.ps1, cuyo mensaje final sólo llega tras compilación, ejecución de SQL 202610270001, cinco diagnósticos aceptados (autorización, producción segura, consumo MP, arranque y pedidos), repair de la nueva versión y despliegue. Instalación/verificación/publicación confirmadas. No volver a pedir ejecutar el instalador ni esa terminal. La salida compartida no incluye git log: no atribuir un SHA de compilación no mostrado. Se conservan los controles anteriores; no hubo importación de pedidos ni cambio de stock por la instalación.

Esto acredita instalación y despliegue, no una prueba real de empleado, aceptación de la app o concurrencia HTTP. Cerrar/abrir la app antes del próximo pedido real. No reingresar pedidos anteriores como prueba. Si aparece un intento pendiente, resolverlo en el mismo navegador mediante Reintentar o Comprobar, conservando su copia. Arranque de inventarios ORG-07 y regularización histórica siguen EN PAUSA; no aplicar conteos ni retomar fecha física automáticamente.

Siguiente: validar el uso real del alta y continuar la revisión transaccional de eliminación de pedidos/recuperación de despacho. La regla de parcial, numeración por cliente y stock mínimo necesitan definición antes de cambiarse. Preparación de micros/empaque al etiquetar pendientes, etapa 3 abierta. Esta entrega sólo registra documentación/seguimiento: no hay SQL ni frontend nuevos que instalar o publicar.


### Eliminación completa y confirmación recuperable de despachos preparadas, 27/10/2026

Tras confirmar OP-02 instalado/verificado/publicado (fbafd456), Iván indica «OK SIGAMOS ADELANTE». Se implementa el siguiente paso, no se reanuda ORG-07 ni regularización histórica. Ver docs/OPERACIONES_LOGISTICA_SEGURAS.md. SQL 202610270002, frontend, verificador e instalador preparados/probados; instalación/verificación/publicación todavía pendientes de terminal real. No se hicieron eliminaciones, despachos ni consultas de filas reales desde aquí.

Nueva tabla privada log_solicitudes_operacion con estado EJECUTANDO/CONFIRMADA/ANULADA, actor, datos, snapshot previo, transacción y resultado. APIs prever_operacion_logistica(text,jsonb), ejecutar_operacion_logistica(uuid,text,jsonb,text,uuid), resolver_operacion_logistica(uuid,text,uuid); sesión esperada, perfil/permisos Pedidos/Despachos y privados sin API directa. Revisión READ ONLY, huella por pedido/reserva/asignaciones/lotes/día y bloqueo de filas antes de ejecutar. Eliminar sólo INGRESADO sin reservas/despachos ni unidades salidas: padre+cascada en una transacción, copia anterior/comprobante permanecen y fallo tardío revierte todo. Una reserva liberada sigue protegida como historial. Comprobante de alta OP-02 permanece vigente=false, sin recrear el pedido al reintentar.

Despachar agrupa activación de conciliación, vínculo de factura y función FEFO instalada dentro de la misma transacción con comprobante. Requiere todas las líneas, IDs propios sin repetir, ceros explícitos, enteros/manejo, cabecera coherente y cantidades dentro de reserva/pedido. Una compuerta se inserta después de OP-12 mediante pg_get_functiondef, preservando cuerpo/firma/propietario/configuración/grants de confirmar_despacho_parcial_fefo, activar_control_conciliacion_despacho y vincular_factura_despacho. Guardias de DELETE en pedidos/detalles y UPDATE en reservas impiden clientes antiguos por pasos o metadatos ACTIVA/estado DESPACHADA sin solicitud privada en igual transacción/actor/payload. GUC falso no basta. Mantenimiento SQL autorizado sin UID se conserva. No hay reemplazo de recetas, funciones de fabricación, saldos, políticas ni facturas comerciales ajenas al vínculo de la reserva.

Se conserva regla actual de parcial: descuenta lo real y cierra DESPACHADO aunque falte cantidad. OP-09 requiere definición antes de cambiarlo. Factura vacía sigue permitida para vincular después. Despachos DESPACHADOS conservan corrección de factura sin repetir salida; recuperación devuelve comprobante original y no sobrescribe una corrección posterior. Metadatos prematuros antiguos no se limpian masivamente: una nueva llamada aplica juntos sus cambios o vuelve al estado anterior. Preparar/liberar reserva siguen con sus funciones originales, bloqueo de doble clic y validación de ID; no tienen todavía comprobante persistente nuevo. Si fallan, actualizar y comprobar estado antes de repetir. No afirmar toda logística terminada por esta entrega.

Cliente: utilidad de copia/validación/control compartido, repositorio, hook y panel de intentos en Pedidos y Despachos. Guarda UUID/datos/token/pedido esperado antes de enviar. Dos clics comparten envío. Respuesta perdida se comprueba; si no puede verificarse, bloquea operaciones en esas pantallas y permite reintentar lo mismo, comprobar/cerrar o descargar copia. Cierre de ausencia bajo el mismo bloqueo sella llegadas tardías. No borrar almacenamiento ni cambiar de dispositivo para resolverlo. Tras cierre sin ejecución se recarga/revisa el estado actual, no se restaura un token antiguo automáticamente; descargar copia antes de salir si hace falta. Selecciones y lecturas tienen protección ante respuestas atrasadas. Mensajes de éxito de confirmación no dependen de que se refresque la lista.

Instalador scripts/Instalar-OperacionesLogistica.ps1 compila primero, ejecuta sólo 202610270002_operaciones_logistica_seguras.sql, exige seis diagnósticos de metadatos (OP-12/OP-13/consumo/arranque/pedidos/logística), repair sólo nueva versión y publica cibuspan-one/main. No db push, migraciones antiguas, dependencias nuevas, operaciones reales ni conteos. Si SQL termina y falla publicación, completar Cloudflare y cerrar/abrir app; cliente anterior ya no puede borrar por partes o confirmar por tres llamadas. No retirar controles para conservar un cliente viejo.

155 pruebas locales pasan (86 del escenario SQL exportado y 69 de cliente/regresiones), build TypeScript/Vite/PWA correcto. Pruebas cliente de ambas clases: copia, cantidades, persistencia, doble clic, respuesta perdida, recarga, bloqueo entre tipos, token/datos incompatibles, cierre sellado, respuestas ajenas, almacenamiento/limpieza y sesión/proyecto. SQL aislado con exportado privado del 23/10 y migraciones posteriores: previa READ ONLY, borrado completo/comprobantes, rollback tardío al borrar, reserva después de previa, protección de liberadas, factura/conciliación/salida juntas y rollback tardío, versión de stock, cobertura/cantidades, GUC/cliente antiguo/actualización directa bloqueados, cierre sellado, corrección posterior de factura y actores. Reinstalación CRLF y de todos los paquetes anteriores conserva seis contratos. Verificador detecta guardia deshabilitada y acceso anónimo. No se certificó navegador/HTTP ni varias conexiones PostgreSQL concurrentes; PGlite usa defaults/auxiliares modelados. Dump privado fuera del repositorio.

Siguiente: Iván instala/publica el nuevo alcance con Instalar-OperacionesLogistica.ps1 y comparte su terminal; confirmar sólo ese resultado. Después validar operación real y continuar recuperación de preparar/liberar reserva o definir reglas pendientes de parcial/numeración/stock mínimo antes de modificarlas. Etapa 3 abierta; empaque/micros pendientes. Arranque físico y reconstrucción histórica siguen EN PAUSA.


### Preparación y liberación recuperables preparadas, 04/11/2026

Iván indica «LISTO SIGAMOS» después del bloque de Instalar-OperacionesLogistica.ps1. No aporta otra terminal; esa frase se registra como indicación de continuar, sin inventar verificación/publicación/SHA del alcance anterior. OP-02 (fbafd456) y arranque instalado sin conteo (10e6b372) conservan la evidencia ya recibida. No repetir esas instalaciones ni pedir otra vez el mismo diagnóstico. Arranque físico ORG-07 y reconstrucción histórica siguen EN PAUSA.

Se implementa preparar/liberar con comprobante privado en res_solicitudes_operacion, APIs prever/ejecutar/resolver_operacion_reserva y SQL 202611040001_reservas_recuperables.sql. Detalle en docs/RESERVAS_RECUPERABLES.md. Revisión READ ONLY de pedido/reservas/lotes/asignaciones activas y día, cantidades completas/ceros/manejo, disponibilidad por múltiplos de cada lote y vencimiento conforme al cuerpo FEFO instalado. Huella antes de ejecutar, bloqueos de solicitud/pedido/detalles/lotes, serialización de preparaciones y comprobante en la misma transacción. Rollback tardío completo. Repetir preparación ya liberada devuelve su reserva original sin preparar otra vez; repetir liberación vieja no toca una reserva nueva. Resolver ausencia sella ANULADA contra ejecución tardía. Usuario/actor esperado y privados cerrados a API; se conserva autorización Pedidos/Despachos.

Compuertas después de OP-12 en reservar_pedido_fefo_parcial y liberar_reserva_fefo mediante pg_get_functiondef, preservando cuerpo/firma/propietario/configuración/grants. Trigger res_operacion_segura protege INSERT y transición LIBERADA; GUC por sí solo no autoriza. Mantenimiento SQL sin UID conservado. No es una revisión de todas las políticas/escrituras de tablas. Confirmación/eliminación OP-10 y controles de producción/pedidos/arranque permanecen. No hay comprobantes retrospectivos para llamadas anteriores sin protocolo.

Cliente amplía utilidad/repositorio/panel compartido a PREPARAR/LIBERAR sin perder intentos ELIMINAR/DESPACHAR existentes (mismo almacenamiento v1 por sesión/proyecto). Conserva copia antes de enviar, doble clic, recuperación automática y bloqueo de nuevas operaciones en incertidumbre. Comprueba cantidades/identidad/UUID de reserva devuelta. Despachos usa vista previa/confirmación en las dos acciones y conserva el éxito al refrescar detalle. Los helpers de despachoRepository exigen revisión y no hacen fallback a RPC suelta. No cambia menús, rutas, DashboardV2, Finanzas, dependencias o reglas de parcial/numeración/stock mínimo.

179 pruebas locales pasan (105 SQL exportado + 74 cliente/regresiones), build correcto. Casos de reintentos tras cambiar estado, rollback preparar/liberar, misma clave/otra clave, actor/permisos/UID, datos completos, revisión obsoleta por otro pedido, vencimiento/sobrantes por lote, integración OP-10 y siete diagnósticos. Reinstalar CRLF y seis paquetes anteriores mantiene comprobantes/contratos. PGlite aislado con defaults/auxiliares modelados y dump privado sin publicar. No hubo navegador/HTTP concurrente ni varias conexiones PostgreSQL reales, ni consulta/escritura a documentos de la base real. No afirmar aceptación operativa por estas pruebas.

Instalador scripts/Instalar-ReservasRecuperables.ps1 preparado: compila, sólo SQL 202611040001, siete diagnósticos, repair sólo esa versión y Cloudflare cibuspan-one/main. Requiere 202610270002; si falta, completar el instalador anterior y después el nuevo, no db push ni reinstalaciones antiguas por rutina. No prepara/libera/despacha pedidos ni cambia stock al instalar. Si SQL se instala pero falla publicación, completar Cloudflare y cerrar/abrir PWA; cliente viejo queda bloqueado intencionadamente.

Estado al entregar: código probado y preparado en main; instalación/verificación/publicación de 202611040001 pendientes de terminal. Siguiente: confirmar sólo ese resultado cuando llegue y validar circuito real. Etapa 3 abierta, OP-09/OP-03/stock mínimo requieren definición; micros/empaque siguen pendientes. No volver a la auditoría desde cero ni reactivar ORG-07 automáticamente.


### Reservas recuperables instaladas, verificadas y publicadas, 04/11/2026

Iván comparte la terminal de Instalar-ReservasRecuperables.ps1: Cloudflare https://71953738.cibuspan-one.pages.dev y mensaje final «Reservas recuperables instaladas, verificadas y publicadas. No se prepararon ni liberaron pedidos y no se cambio stock». Se confirma instalación SQL 202611040001, siete diagnósticos de metadatos, registro de esa migración y publicación conforme al orden protegido del instalador. El control de operaciones logísticas 202610270002 también queda confirmado instalado/verificado como prerrequisito; no se atribuye una publicación independiente anterior ni un SHA de compilación porque el fragmento no incluye git log.

No volver a pedir esta terminal ni ejecutar Instalar-ReservasRecuperables.ps1, Instalar-OperacionesLogistica.ps1 o migraciones anteriores por rutina. El código preparado corresponde al commit cea6fdafcbb4eff0fcf0718d4b62f1426fd8ce43; distinguir esa referencia del SHA efectivamente compilado, que no aparece en el fragmento recibido. Cerrar/abrir la PWA para cargar el cliente publicado. Instalar no ejecutó preparación/liberación ni movimientos de stock según el resultado comunicado.

Siguiente: validar el uso real del circuito cuando corresponda y definir con Iván las reglas pendientes antes de cambiarlas: OP-09 cierre parcial/saldo, OP-03 numeración y stock mínimo. La terminal prueba instalación/verificación/publicación, no aceptación operativa por empleados ni varias conexiones PostgreSQL. Etapa 3 abierta; micros/empaque y los demás pendientes continúan. Arranque físico ORG-07 y reconstrucción histórica EN PAUSA, sin conteo aplicado ni fecha elegida. Esta actualización sólo registra seguimiento: no hay código de app/SQL nuevo que instalar o publicar.


### OP-09 definido; corrección de despacho preparada, 04/11/2026

Iván aclara que casi siempre despacha completo, a veces parcial: guardar lo que realmente se enviará, descontar cuando se despache y cerrar, sin saldo pendiente. Autoriza opción de editar por equivocación. OP-09 deja de ser decisión pendiente: no volver a preguntar cierre vs saldo ni crear entregas automáticas. Se conserva regla del servidor y pedido original para Fill Rate. El botón de preparación ahora dice Guardar preparación, conserva reserva al volver a entrar y explica que el stock físico sólo se descuenta al confirmar. No agrega otro guardado al escribir cada campo.

Editor en el detalle del Historial: datos actuales por SKU/lote, cantidades en gavetas/cajas, motivo obligatorio, revisión de antes/después y diferencias; salir sin guardar. Para aumentar unidades/SKU omitido o cambiar lote se selecciona el lote que realmente salió, sin inventarlo con FEFO actual. Corrige diferencias sobre inventario y asignaciones en una transacción con comprobante; no reabre pedido ni cambia factura/pedido original. Guarda fecha/responsable/motivo/snapshot y permite ver correcciones anteriores. No añade anulación total: SKU individuales pueden quedar cero, despacho conserva al menos una unidad de manejo.

SQL 202611040002_edicion_despachos.sql, tabla privada ed_solicitudes_despacho y APIs obtener/prever/ejecutar/resolver_edicion_despacho. Valida cierre, coherencia previa, líneas/lotes propios, cantidades/manejo/máximo pedido, stock libre de otras reservas y estado/versión actual. Trigger adicional protege asignaciones confirmadas, cantidades despachadas de pedido cerrado y reapertura sin contexto privado de actor/transacción/objeto; GUC solo no autoriza. Conserva contratos previos, cuerpo FEFO, RLS ajeno y mantenimiento SQL autorizado. Lotes archivados no cambian; no aumenta salida de vencidos/futuros. Corte físico aplicado bloquea correcciones de salidas anteriores o sin fecha comprobada; no se usa fecha de entrega/reserva como prueba de salida.

Kardex observa sólo delta por lote a fecha actual Ecuador, ENTRADA/SALIDA, documento reserva y motivo. solicitud_id es UNIQUE por movimiento: UUID por lote derivado de solicitud corrección + lote y solicitud_datos enlaza solicitud_correccion. No cambiar ese contrato ni usar el mismo UUID como solicitud_id de varios lotes. Asignaciones existentes conservan ID salvo cero explícito; snapshot mantiene anterior. Error tardío revierte físico, movimientos, cantidades/asignaciones y comprobante juntos. No se reescribe salida original ni se aplican correcciones retrospectivas sin control.

Cliente amplía mismo almacenamiento/hook/panel a CORREGIR, preservando cuatro tipos previos. Copia antes de envío, revisión con huella, doble clic, recuperación, cierre sellado de ausencia y bloqueo en incertidumbre. Respuesta comprueba cantidades, motivo, IDs y balance. Reintentar corrección vieja no deshace posteriores; recuperar confirmación inicial no vuelve a descontar ni sobrescribe corrección. Releer estado actual. No borrar localStorage/cambiar dispositivo para resolver incertidumbre. No hay navegador/multiconexión certificados.

204 pruebas pasan (125 SQL exportado + 79 cliente/regresiones), build correcto. Ver docs/EDICION_DESPACHOS.md para alcance y límites. Stock/precios/documentos reales no se consultaron ni escribieron desde aquí; PGlite aislado usa exportado privado y auxiliares modelados. No se publica el dump. Reinstalar CRLF y siete paquetes anteriores conserva ocho diagnósticos y comprobantes.

Instalador scripts/Instalar-EdicionDespachos.ps1: build, sólo SQL 202611040002, ocho diagnósticos, repair sólo esa versión y Cloudflare main. Sin db push, dependencias nuevas, operaciones de negocio ni conteos. Estado al entregar: preparado/probado en main; instalación/verificación/publicación nuevas pendientes de terminal. Reservas recuperables ya instaladas/verificadas/publicadas según terminal 71953738; no repetir esa terminal ni paquetes anteriores. El fragmento no certifica SHA compilado. Tras nueva terminal, registrar resultado y validar uso real. OP-03/stock mínimo, micros/empaque y etapa 3 siguen abiertos. ORG-07 y reconstrucción histórica EN PAUSA.


### Edición de despachos instalada, verificada y publicada, 04/11/2026

Iván comparte la terminal de Instalar-EdicionDespachos.ps1: Cloudflare https://abd0efe0.cibuspan-one.pages.dev y mensaje final «Edicion de despachos instalada, verificada y publicada. No se corrigieron documentos ni se cambio stock». Se confirma SQL 202611040002 instalado, ocho diagnósticos de metadatos superados, registro de esa migración y publicación según los pasos protegidos del instalador. No se corrigieron documentos ni cambió stock al instalar conforme al resultado comunicado. El fragmento no incluye git log: el código preparado se referencia en 204cab445867f9f551f371c54e3c887c36ae9fad, sin atribuirlo como SHA efectivamente compilado.

No volver a pedir este resultado ni ejecutar Instalar-EdicionDespachos.ps1 o paquetes anteriores por rutina. Cerrar/abrir la PWA; Despachos > Historial > seleccionar pedido > Editar despacho. Esta actualización sólo registra seguimiento en archivos, sin SQL/frontend nuevos que instalar/publicar. La instalación no demuestra todavía aceptación operativa por empleados ni una prueba multiconexión.

OP-09 sigue definido: cierre con cantidades reales, sin saldo pendiente; no volver a preguntar cierre vs saldo. Siguiente: validar uso real cuando corresponda y continuar pendientes de auditoría, definiendo OP-03/numeración y stock mínimo antes de cambiarlos. Micros/empaque y etapa 3 siguen abiertos. ORG-07/arranque físico y reconstrucción histórica EN PAUSA; no hay conteo aplicado ni fecha elegida. Ver docs/EDICION_DESPACHOS.md para contrato y evidencia.


### Objetivo de puesta en marcha: lunes 09/11/2026

Iván pregunta qué sigue y fija operar desde el lunes próximo (09/11 según fecha cliente 04/11). Se prioriza llegada a operación diaria de pedidos/producción/PT/bodega, sin desvíos a reorganización de menús o reconstrucción histórica. Ver docs/PUESTA_EN_MARCHA_20261109.md. Se retoma la PREPARACIÓN del arranque físico para ese objetivo; no se aplica corte ni se inventa un conteo. El objetivo de fecha no prueba disponibilidad ni reemplaza aceptación del equipo. Confirmar actividad del domingo 08/11 para coordinar último movimiento/conteo. Elegir fecha 09/11 al confirmar el 08/11 o 09/11, no forzar la restricción hoy/mañana. Histórico de octubre EN PAUSA. Módulo de corte ya instalado, sin conteo; no reinstalar.

Se detecta que obtener_produccion_sugerida() agrega todos los INGRESADOS sin fecha_entrega. Se implementa obtener_produccion_sugerida_periodo(date,date), lectura STABLE con autorización Producción/Reportes/Dashboard, rango inclusivo hasta 366 días y sin anónimo. Función antigua intacta, sin overload que rompa OP-12; recuperación de catálogo y consumidores antiguos la conservan. Plan nuevo agrupa SKU físicos, resta disponible sin reservas ajenas y semielaborados de vista instalada; PT debe estar vigente hasta último día elegido, criterio conservador en períodos largos. Stock mínimo sigue informativo. No pronostica stock futuro ni valida caducidad de semielaborados (la vista no expone ese campo): revisar aptitud operativa.

Producción sugerida muestra fechas entrega desde/hasta, inicial hoy/mañana Ecuador, separadas de fecha real de fabricación. Cambio de período reinicia selección/paradas; refrescar mismo período conserva ajustes. No se confirma desde período sin aplicar, consulta pendiente o fallida. Guarda versión de consulta para descartar respuestas atrasadas; al volver a Sugerida vuelve a calcular. Consulta estado del arranque y muestra sugerencia referencial mientras falta conteo o fecha futura de apertura. No registra fabricación al calcular.

SQL 202611040003_planificacion_periodo.sql, verificador y scripts/Instalar-PlanificacionPeriodo.ps1 preparados/probados. Build, sólo SQL nuevo, nueve diagnósticos, repair sólo esa versión y Cloudflare main; no db push, dependencias ni datos reales de negocio. Instalación/verificación/publicación de este alcance pendientes de terminal. Los ocho alcances anteriores ya están instalados/verificados según terminales recibidas; no pedirlos de nuevo ni repetir paquetes. Ver docs/PLANIFICACION_POR_FECHAS.md. 216 pruebas locales (134 SQL exportado + 82 cliente/regresiones) y build correctos; PGlite con auxiliares modelados, sin HTTP/multiconexión ni navegador/aceptación de empleados certificados. Dump privado no se publica.

Plan hasta el 09/11: 4-5 instalar fechas/revisar datos; 5-6 validar catálogo, recetas reales, pedidos y accesos; 6 recorrer proceso sin documentos ficticios en vivo y simulación aislada; último turno previo al lunes contar MP/empaques/micros inventariables/semielaborados/PT/lotes; 8 al cierre o 9 antes del primer movimiento aplicar corte revisado una vez; 9 primer circuito real y cierre comparado. Compras, preparación de micros y empaque al etiquetar siguen con Kardex explícito y responsable; no asumir automatización. No descontar ingredientes y micro preparado dos veces. OP-09 resuelto sin saldo pendiente; OP-03/stock mínimo siguen por definir y no se cambian por plazo. Micros/empaque automáticos y etapa 3 siguen abiertos. No prometer listo sólo por pasar pruebas o publicar.


### Domingo 08/11 con despachos confirmado; producción por definir

Iván confirma el 04/11 que el domingo sí hay despacho y todavía no se sabe si habrá producción. No volver a preguntar si hay despachos ni asumir planta sin actividad. Conteo final después del último despacho del domingo y de cualquier producción de ese día. Antes preparar catálogo/lotes/unidades, sin tomar cantidades anteriores como cierre. Si no es viable terminar el domingo, contar/aplicar el lunes 09/11 antes de su primera producción, entrada o despacho. Movimientos posteriores al conteo requieren actualización/reconteo y conciliación antes de confirmar. Hora exacta y decisión de producción pendientes; no inventarlas ni aplicar el corte. El objetivo lunes 09/11 sigue condicionado al conteo completo y validación.

Se actualizan checklist humano conservando identidad y docs/PUESTA_EN_MARCHA_20261109.md. SQL 202611040003 de planificación por fechas sigue preparado/probado en main: instalación/verificación/publicación todavía no confirmadas por terminal. Esta respuesta de horarios no las acredita ni requiere SQL/frontend nuevos que publicar. Ocho paquetes anteriores mantienen confirmaciones, histórico de octubre en pausa y preparación física retomada sin conteo aplicado.


### Capturas en R2 y retiro de fotos de perchas — 04/11/2026

Iván autorizó almacenar capturas fuera de Supabase y retirar la carga de fotos de perchas. El mensaje observado `exceed_storage_size_quota` bloquea un guardado de revisión: no es un error de OCR ni prueba que se haya guardado. Queda como impedimento de salida en vivo hasta restablecer y comprobar la cuenta real.

Implementación preparada: `docs/CAPTURAS_R2.md`, `scripts/Instalar-CapturasR2.ps1`, SQL nuevo exclusivo `202611040004_capturas_r2.sql`, servicio Pages privado vinculado a R2 `CAPTURAS_CAMPO` y secreto `CAPTURAS_FIRMA`. Nuevas capturas conservan resolución, nombre por hash evita duplicados al reintentar. Mantiene ingreso manual Rosado/Santamaría, caras/presencia/GPS. Formulario sin fotos de perchas; no elimina fotos históricas.

Administración puede copiar todas las capturas históricas vinculadas por páginas, verificar SHA-256, descargar informe y detener/reanudar. El retiro de originales es una acción separada con confirmación explícita en la app: relee/compara original y copia, usa Storage API y comprueba ausencia. Nunca borrar tablas de Storage con SQL. No se modifica la ruta en la visita: lectura híbrida prioriza R2 y conserva el original como alternativa mientras exista. Autorización replica propietario/admin/supervisión por cliente; anónimo denegado y migración exclusiva admin.

Pendiente del propietario: activar R2/revisar condiciones, crear bucket Standard privado `cibuspan-one-capturas`, vincularlo a Pages Production, ejecutar instalación y probar una carga/lectura real antes del traslado. La instalación crea la firma en memoria y no activa planes, no migra ni borra archivos. El instalador verifica la planificación `202611040003` (entregada pero sin confirmación): si su función no existe, instala/verifica solo ese SQL nuevo antes de publicar; si existe y no cumple el contrato se detiene. No reinstala SQL antiguo. No afirmar publicado, migrado ni desbloqueado a partir del commit o de pruebas locales.

El bloqueo de Supabase puede impedir autorizar/descargar/copiar/borrar hasta que el servicio sea restablecido. El cambio no desbloquea automáticamente el proyecto; la cuota es del ciclo y también cuentan las perchas antiguas y otros archivos no incluidos en la limpieza. No activar cargos ni borrar otras evidencias sin una decisión concreta del propietario. No cambiar el estado operativo de inventarios/arranque ni afirmar aceptación del lunes por este cambio.

Verificación local del cambio R2: 38 pruebas aprobadas (10 servicio, 6 permisos SQL, 22 regresiones) y compilaciones de app y Worker. Las cuentas reales y el traslado siguen pendientes.

Además, 134 escenarios de integración operativa aislada aprobados, incluyendo el diagnóstico de planificación ampliado (172 comprobaciones en total). Sin ejecución en la base real.


### Instalación R2 confirmada por terminal — 05/11/2026

Iván completó la activación de R2 y mostró el bucket `cibuspan-one-capturas`, Standard, con acceso público deshabilitado. Confirmó guardar el binding `CAPTURAS_CAMPO` en Pages. Después compartió la salida final de `Instalar-CapturasR2.ps1`: despliegue https://ee9dcaf5.cibuspan-one.pages.dev y «Servicio R2 instalado y publicado; binding y firma presentes. No se trasladaron ni borraron archivos».

Esta salida confirma que el instalador terminó: contrato de planificación `202611040003` comprobado, permisos `202611040004` instalados/verificados y registrados, firma configurada y publicación con presencia de binding/firma comprobada. No permite saber si la planificación ya estaba instalada o se completó en esta ejecución; no reinstalarla por esa duda. La evidencia es la terminal del propietario, no una consulta directa del agente a las cuentas reales.

Pendiente inmediato: cerrar/reabrir PWA, guardar una captura de una visita real que deba registrarse, abrir esa captura y comprobar que los datos persisten. El aviso final sobre Supabase es un recordatorio del bloqueo observado antes; no es por sí solo otro fallo de esta instalación ni prueba de que el bloqueo continúe o haya desaparecido. Si vuelve el error de cuota, resolver el estado real de Usage/Billing/soporte antes de continuar. No repetir instalación ni releer datos para resolver cuota.

Todavía no se trasladaron ni retiraron originales. Tras comprobar guardado y apertura, administración podrá ejecutar la copia/verificación de capturas anteriores en Campo comercial > Locales y reportes > Almacenamiento de capturas. Mantener el retiro de originales como paso separado posterior a la revisión. Fotos históricas de perchas y otros archivos permanecen; no afirmar que se liberó espacio. No se aplicó conteo de arranque ni se verificó el circuito operativo real por publicar R2. Este registro solo actualiza documentación; no requiere nueva instalación ni publicación.


### Limpieza selectiva de fotos físicas autorizada — 05/11/2026

Iván indica que podemos perder las fotos físicas de perchas: conservar las capturas de la app En Percha. Ya no es necesario respaldar esas fotos físicas por rutina; esta decisión no autoriza a borrar capturas ni otros datos. Solo `capturas_app` se conserva como evidencia necesaria. Las fotos por error cargadas allí se protegen también; no adivinar su contenido ni borrarlas como perchas.

Las pantallas posteriores confirman que la app no puede iniciar sesión por `exceed_storage_size_quota`; organización CIBUSPAN Free, Storage reportado 4,244/1 GB, base 0,11/0,5 GB, ciclo 31/10–30/11/2026. R2 sigue instalado/publicado; no ha trasladado archivos. Se ofreció Pro desde USD25/mes como opción inmediata, pero Iván pidió una alternativa: no contratar ni asumir que aprobó ese pago. No se enviaron solicitudes a soporte.

Herramienta preparada en main: `scripts/Revisar-FotosPercha.ps1`, clasificador `scripts/lib/fotosPerchaStorage.mjs`, consulta de solo lectura `supabase/diagnosticos/diagnostico_fotos_percha.sql` y guía `docs/LIMPIEZA_FOTOS_PERCHA.md`. Sin parámetros solo consulta y guarda resumen privado ignorado por Git. Primer paso entregado: diagnóstico para conocer fotos/espacio potencial, sin borrar. Con `-Eliminar`, operación separada ya autorizada, se reconsulta cada lote y se usa Storage CLI por archivos individuales de `visitas-campo` con nombre percha-, excluyendo cualquier referencia en capturas_app y protegiendo nombres captura-/captura-r2-/desconocidos. No borrar carpetas/buckets ni filas de Storage con SQL. No modifica visitas, stock, pedidos ni recetas. Las referencias históricas a fotos descartadas permanecen; esos archivos ya no abrirán.

Sigue pendiente ejecutar diagnóstico/limpieza en la PC del propietario. La API puede rechazar el borrado por la misma cuota. Si falla, se detiene; no afirmar que el script elude el bloqueo, que no hubo cambios si un lote ya fue enviado ni que bajar el tamaño actual levanta inmediatamente una cuota acumulada. La clasificación es por categoría/ruta y referencias, no reconocimiento visual; revisar ambigüedades. Si la restricción persiste, evaluar soporte antes de más acciones. No prometer salida en vivo del lunes mientras el acceso y el circuito real no estén comprobados.

Verificación local: 11 pruebas aprobadas (8 clasificación/CLI y 3 SQL PGlite de solo lectura) y build. No hubo llamadas de borrado al Storage real; PowerShell/Windows y respuesta a cuota siguen pendientes. No necesita SQL nuevo instalado ni otra publicación.


### Limpieza rechazada por cuota: HTTP 402 confirmado — 05/11/2026

Iván ejecutó el diagnóstico: 959 fotos físicas candidatas, 3792,91 MiB conocidos aproximadamente y 1817 rutas referenciadas protegidas. Resultado local guardado en `diagnosticos_privados/fotos_percha_20261105_123037_852/plan_solo_lectura.json`. Este diagnóstico fue de solo lectura.

Después ejecutó `Revisar-FotosPercha.ps1 -Eliminar` y entregó el error original: `Error status 402` con `exceed_storage_size_quota`. El script terminó en su protección «Storage rechazo el borrado o no confirmo el resultado», sin continuar con otros lotes. La API del proveedor está bloqueando también el retiro de objetos; no atribuirlo a PowerShell, a lectura OCR ni a los permisos de la app. No se confirmó ninguna eliminación; no afirmar que se liberó espacio ni que se borraron las 959 fotos. Si luego hace falta el estado exacto, volver a consultar el diagnóstico sin `-Eliminar`.

No recomendar repetir el mismo borrado, añadir `--debug` para intentar desbloquearlo, borrar filas `storage.objects`/`storage.buckets` por SQL, vaciar el bucket entero ni crear otra app como atajo. La autorización sigue limitada a fotos físicas de percha; todas las capturas de En Percha y los datos de negocio deben conservarse.

Siguiente vía gratuita por intentar: Iván puede abrir soporte de Supabase y solicitar que evalúen acceso temporal a la API de Storage o un procedimiento soportado para retirar únicamente las fotos descartables, conservando las capturas. Preparar el texto para que él lo copie; no enviar solicitudes externas sin su instrucción explícita. No asegurar que soporte concederá el acceso o responderá antes del lunes. Pro continúa como opción inmediata documentada, pero Iván no lo ha contratado ni autorizado. Esperar el ciclo tampoco garantiza resolverlo si el uso permanece alto.

Este registro solo documenta evidencia del propietario; no cambia código, no ejecuta limpieza ni requiere SQL/publicación. El inicio de sesión, traslado R2 y arranque operativo continúan pendientes de recuperar acceso y verificarse con datos reales.


### Requerimiento a soporte enviado por Iván — 05/11/2026

Iván confirmó «ok esta enviado el requerimiento» después de completar el formulario de soporte. Registrar como enviado por el propietario y pendiente de respuesta, no como enviado por el agente ni como desbloqueo concedido. No se conoce número de ticket ni plazo. No pedirle que lo abra otra vez ni enviar duplicados por rutina.

La solicitud pide que Supabase evalúe acceso temporal/procedimiento soportado para eliminar exclusivamente las fotos físicas descartables, conservando capturas de En Percha y datos del negocio. R2 continúa publicado; no hay confirmación de traslado o eliminación, la app sigue pendiente de recuperar acceso y Pro no ha sido contratado/autorizado. Conservar capturas originales en los teléfonos mientras no se confirme su guardado. Cuando llegue la respuesta, revisar instrucciones y alcance antes de proceder; no anticipar limpieza, restablecimiento, fecha de solución ni salida operativa del lunes. Este cambio es solo documental y no necesita instalar ni publicar de nuevo.


### Acuse recibido: ticket Supabase SU-540390 — 05/11/2026

Iván compartió el correo automático de Supabase que asigna SU-540390 a la solicitud ya enviada desde el formulario. Es acuse de recepción, no respuesta técnica, aprobación de acceso temporal ni restablecimiento. Supabase advierte que Free no tiene respuesta garantizada y prioriza planes pagados. No inferir rechazo, plazo de atención ni habilitación de Storage. El bloqueo HTTP 402, la limpieza y el traslado siguen pendientes. No reabrir un caso duplicado ni publicar datos en un foro como seguimiento sin instrucción del propietario.

Se leyó la guía oficial solicitada en el acuse: https://supabase.com/docs/guides/troubleshooting/formatting-support-requests-for-faster-resolution-616717.md (contenido accesible también en https://supabase.com/kb/troubleshooting/formatting-support-requests-for-faster-resolution-616717). En cualquier ampliación de SU-540390: priorizar hechos verificados y brevedad, menos de 300 palabras sin contar logs esenciales, con resumen, impacto, comportamiento esperado/actual, reproducción mínima, entorno, pruebas realizadas, evidencia breve y petición concreta. Conservar error exacto, identificadores y fecha/zona conocidas; señalar incertidumbre, no inventar detalles ni incluir claves, tokens o datos sensibles. No añadir saludos, disculpas o explicaciones sobre la IA. Actualizar el mismo caso, no enviar otro por rutina. El agente no ha enviado mensajes externos.

Hechos disponibles para el seguimiento: proyecto mkntfvsbmlgobettavnu, CIBUSPAN Free, inicio de sesión y Storage CLI bloqueados por exceed_storage_size_quota; Usage reporta 4,244/1 GB; diagnóstico de solo lectura identifica 959 fotos percha descartables (~3792,91 MiB) y 1817 rutas de capturas protegidas; borrado rechazado HTTP 402, sin eliminación confirmada; R2 configurado/publicado sin traslado confirmado. Pedir evaluación de acceso temporal o procedimiento soportado para retirar solo fotos descartables, conservando capturas y datos de negocio. No prometer que se puede mantener Free o abrir el lunes antes de recuperar y verificar el servicio. Pro sigue sin autorización/contratación. Registro documental; no requiere nueva publicación ni comandos.
