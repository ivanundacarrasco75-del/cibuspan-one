# Eliminación completa de pedidos y confirmación recuperable de despachos

Entrega del 27/10/2026, autorizada por Iván con «OK SIGAMOS ADELANTE». Seguimiento ORG-06/08 y OP-10. El alta de pedidos OP-02 ya está instalada/verificada/publicada (fbafd456). El conteo/arranque físico ORG-07 y la regularización histórica permanecen EN PAUSA.

## Estado

Código y SQL 202610270002_operaciones_logistica_seguras.sql preparados y probados localmente. Instalación/verificación/publicación pendientes de terminal real. Esta entrega no ejecuta eliminaciones ni despachos, no importa documentos ni aplica un conteo de inventario.

## Eliminar un pedido

La pantalla solicita una revisión de sólo lectura antes de la confirmación habitual. Muestra número, unidades y cantidad de SKU de la versión actual. Sólo permite pedidos INGRESADOS, sin reservas/despachos asociados ni unidades ya despachadas. Si conserva una reserva LIBERADA, tampoco borra ese historial; antes la presencia de sus detalles ya impedía eliminarlo. Una cabecera antigua vacía y sin reservas puede eliminarse expresamente desde la pantalla; no hay limpieza automática de registros previos.

El servidor bloquea el pedido y sus detalles, compara una huella del estado revisado y elimina la cabecera con su cascada de productos en una sola transacción. Un fallo de un producto revierte también cabecera, demás productos y comprobante. No se vacían primero los productos desde el navegador. Una preparación/reserva o edición entre revisión y ejecución invalida la operación.

El comprobante guarda la copia anterior del pedido y sus productos de forma privada. Sobrevive al borrado y permite recuperar la respuesta sin volver a borrar. El comprobante de alta OP-02 también permanece; su reintento informa vigente=false y no recrea lo eliminado. Esto no añade un botón de deshacer ni restaura automáticamente un pedido eliminado.

## Confirmar despacho

La revisión valida reserva ACTIVA, pedido PREPARADO, cabecera coherente con productos y cantidades de todos los SKU, incluidos los ceros. Rechaza líneas ajenas/repetidas, fracciones, cantidades sobre lo reservado/pedido o fuera de la unidad de manejo. La confirmación muestra unidades, número de factura y advertencia de parcial según el estado revisado.

La nueva llamada ejecuta activación de conciliación, vínculo de factura y confirmación FEFO dentro de la misma transacción que su comprobante. Se conservan las funciones vigentes; sólo se inserta una compuerta después del control OP-12. Si falla stock, Kardex u otro paso, todos los cambios de esa llamada se revierten juntos. El número puede quedar vacío como antes; queda pendiente de vinculación tras confirmar. La factura en una reserva ACTIVA se escribe al confirmar, no mediante un guardado previo independiente. En un despacho ya DESPACHADO se conserva Guardar / corregir factura sin repetir la salida ni sobrescribirla al recuperar un comprobante anterior.

La revisión incluye pedido, reserva, productos, asignaciones y lotes físicos. Al ejecutar se bloquean filas y se compara la huella. Un cambio obliga a revisar otra vez. Un reintento confirmado recupera el mismo resultado antes de consultar el estado actual o volver a llamar al descuento de inventario.

Se conserva el comportamiento vigente del parcial: se descuenta sólo lo realmente enviado y el pedido queda DESPACHADO aunque falten unidades. OP-09 sigue pendiente de una definición comercial antes de cambiar esa regla. No se modifica FEFO ni se certifica una nueva política de caducidad; se usa el cuerpo instalado. Las reservas y metadatos incompletos de versiones anteriores no se corrigen masivamente: la app muestra su estado real y los cambios de una nueva confirmación se aplican juntos o se revierten a ese estado anterior.

## Intentos inciertos y permisos

Ambas pantallas muestran las operaciones logísticas pendientes del mismo usuario/proyecto. Antes del envío se conserva UUID, datos, pedido esperado y revisión en el navegador. Dos clics comparten envío. Si la respuesta se pierde, se comprueba el mismo UUID bajo el bloqueo del servidor. Si sigue incierto, bloquea nuevas operaciones de esas pantallas y ofrece Reintentar la misma operación, Comprobar para corregir y descargar copia. No borrar almacenamiento ni repetir en otro dispositivo para resolverlo.

Comprobar ausencia sella ANULADA con el mismo bloqueo: una petición atrasada ya no podrá ejecutarse después de que se permita revisar otra vez. Ante cierre sin ejecución, actualizar/revisar el pedido actual; no restaurar automáticamente cantidades o token antiguos. La copia del intento cerrado puede descargarse antes de salir si se necesita. Una revisión que se cancela antes de enviar no escribe nada. Los borradores normales no enviados no adquieren persistencia adicional.

La tabla log_solicitudes_operacion tiene RLS y no acepta acceso directo de roles API. Ayudantes privados sin EXECUTE y APIs sin anónimo. Se conserva autorización Pedidos/Despachos, perfil activo y usuario esperado; otro actor no consulta ni ejecuta una solicitud ajena. El contexto de sesión por sí solo no autoriza: se exige registro privado EJECUTANDO de igual transacción/actor/objeto/payload. INSERT de pedidos conserva OP-02; DELETE directo desde clientes viejos y confirmación antigua sin solicitud quedan bloqueados. También se bloquean guardados separados de metadatos ACTIVA o transición directa a DESPACHADA sin la operación completa. Mantenimiento SQL autorizado sin UID de aplicación se conserva.

Las compuertas preservan firma, dueño, configuración, cuerpos y grants previos mediante pg_get_functiondef. No se pega el dump privado. No se cambian políticas de otros módulos, recetas, alta/consumo de producción, reglas de número de pedido ni saldos iniciales. Preparar/liberar reserva siguen usando sus funciones instaladas: tienen prevención de doble clic y validación de ID en la pantalla, pero no reciben en esta entrega un comprobante nuevo de respuesta perdida. Si fallan, actualizar para comprobar estado antes de repetir. Correcciones posteriores de factura conservan su circuito existente.

## Instalar y publicar

Actualizar main y ejecutar scripts/Instalar-OperacionesLogistica.ps1 desde el proyecto vinculado en D:\CIBUSPAN_ONE. Compila primero, aplica sólo SQL 202610270002, exige seis verificaciones de metadatos (autorización, producción segura, consumo, arranque, pedidos y logística), registra sólo esa versión y publica cibuspan-one/main. No db push, dependencias nuevas, reparación de versiones antiguas, corte físico ni operaciones de prueba en vivo.

Si SQL terminó pero la publicación falla, terminar Cloudflare y cerrar/abrir la app; el cliente anterior ya no podrá borrar por pasos ni confirmar por tres llamadas separadas. No retirar controles ni repetir documentos reales para completar la instalación.

## Evidencia y límites

155 pruebas locales superadas (86 del escenario SQL exportado y 69 de cliente/regresiones). Compilación TypeScript/Vite/PWA correcta.

Pruebas de controlador: copia/normalización, validación de cantidades, persistencia previa a envío, doble clic, respuesta perdida, recarga, bloqueo entre ambas clases de operación, datos/token incompatibles, cierre sellado, comprobación sin reenvío, respuestas ajenas, almacenamiento lleno/corrupto/limpieza fallida y aislamiento por sesión/proyecto. Se incluyen regresiones de pedidos/importaciones, producción segura y arranque.

Pruebas SQL en PGlite aislado con contratos exportados privados del 23/10 y las migraciones posteriores: revisión READ ONLY, eliminación con cascada/comprobante, fallo tardío al borrar, reserva creada después de revisar, reservas liberadas protegidas, metadatos+salida juntos, rollback tardío de factura/conciliación/stock, versión de stock cambiada, cobertura/cantidades, llamadas antiguas/GUC falso/actualizaciones directas rechazadas, cierre sellado de ambos tipos, edición de factura histórica sin repetir salida, actor/permisos, reinstalación CRLF y reinstalaciones de paquetes anteriores conservando los seis contratos. El verificador detecta trigger deshabilitado y privilegio anónimo. No se publica el dump privado; los defaults y auxiliares de ensayo están modelados.

No se certifica HTTP concurrente ni varias conexiones PostgreSQL reales, recorrido visual en navegador o aceptación por empleados. Los bloqueos y cambios de estado se prueban secuencialmente; no se consultaron documentos ni se hicieron escrituras en la base real desde aquí. La instalación/verificación/publicación debe confirmarse con terminal. Etapa 3 abierta; reservas recuperables, regla de parcial/numeración/stock mínimo, empaque/micros e históricos mantienen los pendientes documentados.
