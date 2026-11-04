# Cierre del pedido y corrección del despacho

Decisión de Iván, 04/11/2026: normalmente se envía completo; cuando no, se guarda lo realmente enviado, se descuenta al despachar y el pedido queda cerrado. No crear saldo pendiente ni otra entrega automática. OP-09 queda definido con este criterio, conservando pedido original para medir cumplimiento. Se incorpora edición para errores de registro.

## Estado

SQL 202611040002, frontend, diagnóstico e instalador preparados y probados; instalación/verificación/publicación pendientes de su terminal. Código de referencia anterior: reservas recuperables ya instaladas/verificadas/publicadas según terminal del 04/11, Cloudflare 71953738. No reinstalar ese paquete ni pedir su terminal otra vez. Arranque físico ORG-07 y reconstrucción histórica EN PAUSA; no hay conteo aplicado.

## Uso

- Ingresar las unidades reales y pulsar “Guardar preparación”. Persiste la reserva con las cantidades elegidas; al volver a entrar se leen de esa reserva. No es salida física. Se conservan las funciones FEFO y comprobantes de preparación/liberación instalados.
- Al salir la mercadería, “Confirmar despacho” guarda las cantidades efectivas, factura/control y salida de inventario juntos. Se cierra DESPACHADO aunque falte cantidad, sin saldo pendiente. Esta regla ya existía en servidor y ahora queda aceptada y explícita en pantalla.
- En Historial, seleccionar el pedido y “Editar despacho”. Muestra cantidades pedidas/despachadas por SKU y asignaciones a lotes. Cambiar la cantidad correcta en gavetas/cajas. Para reducir un lote completo escribir cero; para agregar un SKU antes omitido o un lote distinto, elegir explícitamente el lote real que salió. No se adivinan lotes históricos con el stock actual.
- Escribir motivo del error (8–1000 caracteres), revisar antes/después, stock a restituir y stock adicional a descontar; confirmar. “Salir sin guardar” descarta el borrador no enviado sin escribir en servidor.
- Se conserva la factura vinculada y el estado cerrado; el pedido original no cambia. El Fill Rate y los anexos/consultas basados en cantidades/asignaciones leen los valores corregidos. El documento de factura externo no se modifica con esta corrección.

Ejemplos: 20 registradas → 10 reales: restituye 10 al lote original. 20 → 30: descuenta 10 del lote indicado si hay disponibilidad. Un cambio de lote restituye al original y descuenta del elegido. El detalle conserva los IDs existentes salvo asignaciones puestas en cero; se guarda snapshot previo y comprobante de cada corrección. El historial muestra fecha, responsable, motivo y total anterior/nuevo.

Este alcance corrige errores de registro; no añade anulación total. Se permite dejar SKU individuales en cero, manteniendo al menos una unidad de manejo en el despacho. No crea entregas pendientes ni registra devoluciones físicas.

## Transacción y trazabilidad

Nueva tabla privada ed_solicitudes_despacho: solicitud UUID, actor, datos, snapshot base, transacción, estado EJECUTANDO/CONFIRMADA/ANULADA, resultado y fecha. RLS y acceso directo API revocado. Se mantiene permiso Pedidos/Despachos y perfil activo, sin cambiar roles/políticas de otros módulos. APIs:

- obtener_edicion_despacho(uuid): datos de editor e historial, sólo lectura.
- prever_edicion_despacho(text,jsonb): valida y muestra efecto sin escribir.
- ejecutar_edicion_despacho(uuid,text,jsonb,text,uuid): bloquea y confirma todo junto.
- resolver_edicion_despacho(uuid,text,uuid): recupera comprobante o sella ausencia.

El payload CORREGIR contiene reservaId, motivo y líneas únicas pedidoDetalleId/inventarioLoteId/unidades. Debe incluir cada asignación original, aun con cero; el servidor valida pertenencia de línea/lote/SKU, cantidades enteras/múltiplos, máximo pedido, integridad de cabecera y consistencia de cantidades previamente despachadas frente a asignaciones. Un despacho inconsistente o con asignaciones originales duplicadas requiere revisión, sin reparación automática. Sólo un despacho cerrado, sin otra reserva ACTIVA ni varios despachos del mismo pedido.

La huella incluye pedido/detalles/reservas, asignaciones, lotes originales y elegidos, reservas activas que ocupan esos lotes, días y metadatos del corte físico. Cambios de stock, cantidades, factura o corte invalidan la revisión. Se bloquean solicitud/reserva/pedido/detalles/asignaciones/lotes y se comparte el mutex de preparación. No se usa leer y escribir desde el navegador para ajustar stock.

Se calcula nuevo menos anterior por lote. El físico cambia sólo por esa diferencia; disminuciones restituyen al lote original, aumentos requieren stock disponible descontando reservas ajenas. No aumenta salidas en lotes vencidos o de producción futura ni modifica lotes archivados. No cambia identidad, producción, vencimiento o SKU de un lote.

El trigger Kardex instalado observa cada delta una sola vez. El contexto registra fecha actual Ecuador, ENTRADA o SALIDA según signo, motivo y documento reserva; no reescribe el movimiento inicial ni retrocede fechas. Como solicitud_id del Kardex es UNIQUE por movimiento, cada lote usa un UUID derivado de solicitud de corrección + ID lote; solicitud_datos enlaza todos con la solicitud de corrección original. Esto permite correcciones con varios lotes sin colisiones de solicitud. No se alteran checks ni triggers Kardex existentes.

Stock, movimientos, asignaciones, unidades despachadas y comprobante se confirman en una transacción; fallo tardío revierte todo. Trigger nuevo protege modificaciones de asignaciones de un despacho confirmado, cantidades despachadas del pedido cerrado y reapertura de una reserva DESPACHADA sin contexto privado de igual actor/transacción/objeto. Un GUC falso no autoriza. Se conserva mantenimiento SQL autorizado sin UID. No es una auditoría completa nueva de todos los permisos/escrituras de tablas.

Si existe corte físico aplicado, una salida anterior a aplicado_en —o sin fecha de ejecución comprobada en el protocolo logístico— no puede ajustar el nuevo inventario mediante este editor. Comparar con el comprobante real de confirmación, no con fecha de entrega solicitada ni fecha de creación de la reserva. El nuevo SQL no aplica conteos ni crea fechas inventadas. Correcciones posteriores válidas se registran hoy, respetando la frontera existente.

## Respuesta perdida

CORREGIR usa el mismo almacenamiento v1, hook y panel de las cuatro acciones anteriores, sin perder intentos existentes. Guarda copia completa antes de enviar, comparte doble clic y bloquea nuevas operaciones en incertidumbre. Validación del resultado incluye actor esperado, solicitud/tipo/pedido/reserva, cantidades, motivo y balance entre entrada/salida y diferencia.

Reintentar devuelve el mismo comprobante antes de mirar el estado actual; no repite un ajuste ni deshace correcciones posteriores. Recuperar la confirmación original tampoco revierte una corrección. Resolver ausencia la sella ANULADA bajo el mismo bloqueo contra llegadas tardías. No borrar almacenamiento ni repetir desde otro dispositivo para resolver un intento incierto. Tras cierre sin ejecución, releer/revisar datos actuales. El comprobante recuperado describe lo ejecutado entonces, no sustituye la relectura del estado actual.

## Instalación

Actualizar main y ejecutar scripts/Instalar-EdicionDespachos.ps1 desde D:\CIBUSPAN_ONE. Compila primero, aplica únicamente 202611040002_edicion_despachos.sql, exige ocho diagnósticos de metadatos, registra sólo esa versión y publica cibuspan-one/main. Sin dependencias nuevas, db push, reinstalaciones antiguas, operaciones de ensayo en vivo ni conteos.

Mensaje esperado: “Edicion de despachos instalada, verificada y publicada. No se corrigieron documentos ni se cambio stock.” Cerrar y abrir la PWA tras publicar. Si SQL terminó pero Cloudflare falla, completar publicación; no retirar controles. No afirmar instalado/publicado hasta recibir su terminal. El instalador no corrige ningún pedido.

## Evidencia y límites

204 pruebas locales pasan: 125 del escenario SQL exportado y 79 de cliente/regresiones. TypeScript/Vite/PWA compilan. No cambian dependencias, rutas, menú, DashboardV2, Finanzas o recetas.

Casos nuevos: editor/revisión READ ONLY; corrección menor/mayor y diferencia única; conservación de estado/factura/pedido y IDs; cambio explícito de lote con dos movimientos; SKU inicialmente omitido y cero por línea; reservas ajenas; huella obsoleta por stock/factura; pertenencia, motivo, enteros/manejo/rango; caducidad/archivo; rollback tardío de físico/Kardex/asignaciones/comprobante; ausencia sellada; sucesivas correcciones e intento antiguo; confirmación original recuperada tras corregir; actor/UID/privados; edición directa/GUC/reapertura rechazadas; corte anterior bloqueado y posterior válido; inconsistencia previa; reinstalación CRLF y siete paquetes previos conservando ocho diagnósticos; detector de trigger deshabilitado y anónimo. Cliente amplía copia, respuesta perdida, recarga/bloqueo entre cinco tipos, doble clic, lotes/motivo, resultado/balance incompatible y cierre sellado, con regresiones anteriores.

PGlite aislado con diagnóstico privado del 23/10 y defaults/auxiliares de ensayo explícitos; ese archivo no se publica. Los casos del corte modelan metadatos aislados para esta frontera, además de los escenarios propios del arranque; no aplican conteos reales. No se certifican HTTP concurrente/multiconexión PostgreSQL real, recorrido visual en navegador o aceptación por empleados. No se consultaron documentos ni se escribieron datos de la base real desde aquí. El instalador PowerShell mantiene el patrón ya usado por Iván; su ejecución final se verifica con la terminal del usuario.

Reproducir: CIBUSPAN_PROBAR_EDICION=1, CIBUSPAN_AUDIT_FILE al exportado privado, CIBUSPAN_SQL_TEST_MODULE al PGlite disponible; node --test pruebas/verificar_flujo_servidor_exportado.mjs. Regresiones cliente: verificar_operaciones_logistica, verificar_registro_pedidos_seguro, verificar_registro_produccion_seguro, verificar_arranque_operativo y verificar_pedidos_octubre con node --test. Finalizar npm run build.

Siguiente: confirmar sólo la instalación/publicación nueva y validar uso real cuando corresponda. OP-09 definido, sin saldo pendiente; OP-03 numeración y stock mínimo aún requieren definición. Micros/empaque y etapa 3 siguen abiertos. ORG-07 e históricos EN PAUSA.
