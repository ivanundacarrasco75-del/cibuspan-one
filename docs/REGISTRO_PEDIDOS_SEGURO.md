# Guardado completo y recuperación de pedidos

Entrega del 27/10/2026, seguimiento OP-02 / ORG-06. Iván autoriza continuar con el siguiente paso después de dejar ORG-07 (conteo/corte físico) en pausa. Este trabajo protege el alta de pedidos; no reactiva el arranque, reconstruye octubre ni modifica existencias.

## Estado

Código y SQL 202610270001_registro_pedidos_seguro.sql preparados y probados localmente. Instalación/verificación/publicación pendientes de terminal de Iván. OP-12, OP-13, consumo MP y módulo de arranque ya instalados se conservan. El arranque físico sigue en pausa, sin conteos aplicados.

## Problema y comportamiento resultante

Antes la app insertaba cabecera y productos en peticiones separadas. Si fallaban los productos, intentaba borrar la cabecera sin comprobar ese borrado. Ahora una sola función guarda la cabecera, todos los productos y su comprobante dentro de la misma transacción. Un fallo revierte todo; no se intenta compensar borrando desde el navegador.

Cada intento conserva UUID, usuario, origen y copia de datos en el navegador antes de enviar. Dos clics comparten la misma petición. Ante respuesta perdida se comprueba el resultado bajo el mismo bloqueo; un intento confirmado devuelve el pedido original. Si no puede comprobarse, bloquea nuevos registros y ofrece Reintentar el mismo pedido, Comprobar para corregir y descarga de la copia. No borrar almacenamiento ni reingresar el pedido desde otro dispositivo para resolver incertidumbre.

Comprobar un intento ausente lo cierra como ANULADA bajo el mismo bloqueo del alta: una petición atrasada con esa clave ya no puede ejecutarse después. Un comprobante confirmado sobrevive a la eliminación permitida del pedido; el reintento informa vigente=false y no vuelve a crearlo. El comprobante no impide la eliminación existente mediante una FK nueva.

Manuales y archivos Favorita/Santamaría/TUTI/Rosado usan el mismo circuito. Una importación de varios pedidos mantiene una transacción por orden: conserva las confirmadas, se detiene ante resultado incierto y deja sin procesar las siguientes. No repite todo el lote para recuperar una orden. Las demás órdenes pueden continuarse después de resolver el intento. Un rechazo conocido queda en la revisión del archivo; puede corregirse/releerse o restaurarse desde el intento cerrado cuando corresponda.

La pantalla puede restaurar en el formulario los datos de un intento cerrado, previa comprobación de cliente/bodega/SKU/unidad vigentes. No restaura parcialmente un catálogo cambiado. La copia descargable permite revisar todas las líneas si hay diferencias. La recuperación del intento pendiente se conserva entre recargas; un borrador normal aún no enviado no se guarda automáticamente. Tras cerrar un intento, descargar/restaurar la copia antes de salir si se necesita conservar esa corrección.

## Validaciones y compatibilidad

- Cliente y bodega activos y relacionados, producto activo y habilitado para el cliente, empaque y unidad de manejo vigentes. Se bloquean catálogos con lectura compartida durante el alta.
- Cantidades positivas enteras, múltiplos de unidad de manejo, SKU sin repetir, fechas/horas válidas, total dentro del rango de integer. Se admiten pedidos históricos y entregas futuras: el pedido no crea ni descuenta stock.
- Se conserva la prevención global por número, sin distinguir mayúsculas y con espacios externos normalizados, que ya aplicaba la interfaz. El servidor toma un bloqueo por número para nuevas altas concurrentes. El número se compara como texto literal: % y _ no se interpretan como patrones ILIKE. No se incorpora índice único sobre históricos ni se eliminan o modifican duplicados anteriores. OP-03 mantiene pendiente la decisión comercial de cambiar ese alcance a por cliente; no se adopta ese cambio en esta entrega.
- La advertencia de pedido adicional en igual bodega/fecha se conserva. Distintos números pueden representar pedidos legítimos de esa bodega/fecha. No deduplicar por fecha/SKU/cantidades.
- El número del cliente permanece igual. El ID interno nuevo usa PED-fecha-UUID de solicitud, evita la colisión de reloj del navegador y mantiene los pedidos anteriores sin renumerarlos.
- Autorización con sesión, perfil activo y los permisos Pedidos/Despachos que ya exigen los triggers existentes. Tabla privada con RLS y sin acceso directo para roles API; auxiliares sin EXECUTE para esos roles; APIs sin permiso anónimo. Se comprueba el usuario esperado al registrar/recuperar.
- INSERT de cabecera/detalles desde clientes viejos queda bloqueado si no existe una solicitud privada de la misma transacción/actor/payload. Un GUC con UUID inventado no sustituye esa prueba. Se conserva mantenimiento SQL autorizado sin UID de aplicación; service_role sin UID no usa las APIs de alta, que requieren responsable real.
- No se alteran políticas previas ni cuerpos de funciones operativas de producción/despacho. Si falla la consulta posterior de la lista, se informa que el pedido sí quedó confirmado; no se presenta como un alta fallida.

## Instalación

Con el proyecto vinculado y sesiones locales que Iván ya utiliza, actualizar main y ejecutar scripts/Instalar-RegistroPedidosSeguro.ps1. Compila primero; instala sólo 202610270001; exige cinco diagnósticos (autorización, producción segura, consumo MP, arranque y pedidos); registra sólo la nueva versión y publica cibuspan-one/main. No db push, npm ci, importaciones, corte físico ni reinstalación de SQL antiguo. No hay dependencias nuevas.

Si SQL termina y falla Cloudflare, completar la publicación pendiente: los clientes anteriores ya no podrán usar el alta separada. Cerrar/abrir la app publicada antes de continuar pedidos reales. No revertir las protecciones para mantener un cliente antiguo ni registrar pedidos ficticios como prueba.

## Evidencia y límites

Resultado de esta entrega: 125 pruebas locales pasan (71 escenario SQL exportado + 54 cliente/parsers/regresión), compilación TypeScript/Vite/PWA correcta.

Pruebas locales de cliente sobre copia/validación, doble clic, origen de importación, respuesta perdida, recarga, modificación de datos de clave incierta, cierre sellado, comprobantes eliminados, respuestas ajenas/malformadas, almacenamiento lleno/corrupto, limpieza fallida y separación por usuario/proyecto. Regresión de parsers de pedidos, producción segura y arranque incluida.

SQL ensayado con PGlite y estructura/cuerpos privados exportados el 23/10, agregando cliente_productos del mismo exportado. Incluye alta exacta, rollback tardío de detalle sin huérfanos, número normalizado y alcance global conservado, catálogos/unidades/cantidades, reintento tras despacho o cambio de catálogo, eliminación sin recreación, permisos, cierre sellado, GUC falso, cero cambios de stock, integración con corte ya confirmado y reinstalación CRLF. Los cinco diagnósticos siguen correctos y el nuevo verificador detecta un trigger deshabilitado. El dump privado no se publica; defaults/auxiliares de ensayo están modelados.

No se certifican HTTP concurrente, recorrido visual en navegador ni aceptación real de empleados. Los bloqueos se implementan en servidor; el ensayo PGlite no equivale a varias sesiones PostgreSQL concurrentes. No hubo registros en la base real desde aquí. La eliminación del pedido aún usa el flujo existente de varios pasos y queda pendiente de revisión transaccional propia; este comprobante conserva la prueba del alta y evita recreación por el mismo intento, no certifica la eliminación. No se resuelven en esta entrega parcial de despacho, numeración por cliente, stock mínimo, empaque/micros ni conciliación histórica. Etapa 3 abierta.
