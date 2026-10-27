# Resultado de la revisión operativa del servidor

Fecha: 23/10/2026. Etapa 3 en curso. Se leyó el diagnóstico que Iván adjuntó como Texto pegado(2).txt. Contiene 30 funciones, 39 objetos y 181 políticas; generado el 23/10/2026 a las 11:05 de Ecuador. Se inspeccionaron definiciones, no filas de negocio. No se modificó la base ni la aplicación en uso.

## Lo comprobado

| Proceso | Resultado del código instalado exportado y ensayo local | Acción |
| --- | --- | --- |
| Registrar producción | Crea cabecera/detalles, aumenta PT o semielaborado y el trigger registra el delta PT. No consume materias primas en este circuito. | Completar consumo con documento, fecha, cantidades y versión de receta o consumo real. No aplicar recetas actuales a históricos automáticamente. |
| Repetir producción | El mismo payload genera otra producción y vuelve a aumentar existencias. No hay clave de solicitud/documento en este RPC. | Proteger reintentos y respuesta perdida. Dos fabricaciones legítimas del mismo SKU/día no deben confundirse con un reintento. |
| Error en producción | Un detalle inválido revierte también cabecera, alta de lote y Kardex de esa llamada. | Conservar esta transacción; no sustituirla por escrituras sueltas. |
| OP histórica | Su función instalada y sus tablas sin triggers sólo guardan historial y consumos reportados. No modifican MP/PT. | Mantener separada de fabricación operativa y conciliar antes de aplicar faltantes al inventario. |
| Número de pedido | pedidos tiene índice único sólo en id; no en numero_pedido_cliente. El cliente consulta antes de insertar, pero dos solicitudes pueden pasar esa consulta. | Guardado transaccional y protección de reintento/número según alcance comercial. No crear índice sobre datos reales sin revisar duplicados previos. |
| Preparar y liberar | Reservar cambia disponibilidad, sin descontar físico; liberar recupera disponibilidad sin crear entrada. | Conservar separación. Ensayo local secuencial; concurrencia real todavía pendiente. |
| Confirmar despacho | Descuenta físico y Kardex PT una vez. La misma reserva ya confirmada rechaza un segundo intento. | Conservar bloqueo de reserva y salida única. No prometer idempotencia exitosa: el segundo intento devuelve error. |
| Entrega parcial | Guarda cantidad realmente despachada y cierra el pedido como DESPACHADO; el faltante deja de entrar en la planificación. | Definir si ese faltante se cierra o queda para otra entrega antes de cambiar comportamiento. |
| Factura/conciliación | Son llamadas previas separadas. Pueden permanecer guardadas si falla después la confirmación. | Recuperación verificable; no repetir operaciones para arreglar estados. |
| Stock mínimo | El RPC lo devuelve, pero no lo suma a necesidad_neta. Sin pedidos, con mínimo 100 y stock 0, sugiere 0. | Definir planificación sólo por pedidos o también reposición de seguridad. No modificar fórmula sin esa regla. |

Se detectó además un pendiente prioritario de autorización de operaciones. Su evidencia y comprobación local se conservan en el informe privado de Iván; no se publica el diagnóstico completo en este repositorio público. No hay evidencia de uso indebido ni se hicieron pruebas contra endpoints reales.

## Evidencia y límites

Fuente: diagnóstico adjuntado por Iván, SHA-256 971175f50c90e917499b7563207cb3617a9022395e378806e73cdc27a435cbed. Los textos con acentos muestran una conversión de consola; no se concluye que estén corruptos en la base ni se corrigen por suposición para crear una migración.

pruebas/verificar_flujo_servidor_exportado.mjs ejecuta los cuerpos exportados en PGlite aislado. Recibe la ruta privada mediante CIBUSPAN_AUDIT_FILE; no incluye esa exportación en Git. Los tipos, columnas, checks, claves, triggers y vistas seleccionadas proceden del archivo. Defaults, usuario/permisos de ensayo y una vista auxiliar de resumen de semielaborados se modelan expresamente. Los escenarios de planificación no tienen semielaborados. No es una réplica completa ni una certificación de concurrencia/HTTP/RLS o saldos reales.

La versión 1 del diagnóstico no incluye defaults, grants de tabla, carácter PERMISSIVE/RESTRICTIVE de políticas, FORCE RLS ni todas las dependencias de las vistas. No interpretar la coexistencia de políticas como una apertura de acceso sin revisar esos elementos. Para este recorrido ya no hay que repetir la exportación: completar sólo dependencias concretas cuando una adaptación las necesite.

Pruebas: nueve escenarios operativos nuevos reproducen tanto protecciones existentes como comportamientos por corregir. «Pasó» significa que el comportamiento descrito fue reproducido, no que esos defectos ya estén solucionados. Se mantienen las pruebas del diagnóstico y Kardex. No se escribieron datos de producción.

## Seguimiento y orden de trabajo

- OP-01: recibidas y leídas las funciones base. Pendientes sólo dependencias específicas, no repetir la auditoría desde cero.
- OP-03: confirmada ausencia de unicidad del número de pedido en la estructura exportada; regla global/por cliente pendiente.
- OP-04: confirmado importador histórico analítico, sin alta/consumo físico en ese camino.
- OP-07: falta de consumo confirmada en exportado original. Para nuevas fabricaciones, consumo revisado y guardado atómico instalados/verificados/publicados según Texto pegado(5).txt recibido 24/10/2026 (f11fe8a/7faeb857). Validación operativa pendiente. Históricos y empaque/micros pendientes; ver docs/CONSUMO_MP_PRODUCCION.md.
- OP-08: separación de reserva/salida comprobada localmente con funciones reales; concurrencia y conciliación real pendientes.
- OP-09: cierre del parcial confirmado en servidor; regla del faltante pendiente con Iván.
- OP-10: efectos previos separados reproducidos; recuperación pendiente.
- OP-12: autorización instalada y verificada según terminal posterior de Iván; ver docs/AUTORIZACION_OPERATIVA.md. Usuarios reales pendientes.
- OP-13: solicitud estable/recuperación instaladas, verificadas y publicadas según Texto pegado(3).txt: d12e18b/Cloudflare 4e741568. Validación operativa por usuarios pendiente; ver docs/REGISTRO_PRODUCCION_SEGURO.md.
- OP-14: stock mínimo informativo pero fuera de la fórmula; regla de reposición pendiente.

Conservar el circuito y corregir por partes. Autorización y protección de reintentos instaladas/verificadas; protección de reintentos publicada. OP-07 de nuevas fabricaciones también instalado/verificado/publicado. Siguiente: preparar conciliación y regularización de consumos históricos con criterio explícito; después guardado transaccional de pedidos. No reordenar menús ni crear otra aplicación mientras se cierran estas conexiones. No reiniciar octubre ni reimportar existencias.

La etapa 3 sigue abierta. Faltan validación por usuarios, reglas de parcial/stock de seguridad, ensayo aislado y conciliación de cantidades reales. El PDF CIBUSPAN_ONE_Avance_Revision_Operativa_20261023 resume este avance para Iván. El paquete CIBUSPAN_ONE_Revision_Operativa_Privada_20261023 conserva la evidencia y el relevo técnico en privado.

## Avance posterior: autorización y reintentos instalados

Iván autorizó continuar. OP-12 tiene SQL nuevo específico, instalador y comprobación de sólo lectura, documentados en docs/AUTORIZACION_OPERATIVA.md. Probado en escenario de contratos y aplicado localmente a las funciones reales exportadas, sin cambiar sus cuentas ni estados. Iván devolvió la terminal: SQL verificado, migration repair 202610230001 aplicado y mensaje final de protección en doce funciones. OP-12 instalado; prueba con usuarios pendiente. No requiere frontend. Texto pegado(3).txt confirma OP-13: main d12e18b, compilación correcta, verificación superada, repair 202610230002 aplicado y Cloudflare https://4e741568.cibuspan-one.pages.dev publicado. Falta validación operativa por usuarios; no equivale a ensayo concurrente HTTP en vivo. Ver docs/REGISTRO_PRODUCCION_SEGURO.md. En ese momento el consumo MP estaba pendiente; el estado posterior se actualiza abajo. La etapa 3 sigue abierta.


## OP-07 de nuevas fabricaciones instalado y publicado

Iván indica «listo, dale» al descuento MP al registrar producción. SQL 202610230003, interfaz de consumos por SKU, detalle en historial, diagnóstico e instalador específicos preparados. Confirmar cantidades reales propuestas por receta o ingresadas manualmente; la confirmación OP-13 dispara la salida MP en la misma transacción que PT/semielaborado. Reintentos no repiten el consumo. No reemplaza funciones protegidas, no cambia recetas ni crea asientos históricos. 102 pruebas y build correctos. Texto pegado(5).txt, recibido el 24/10/2026, confirma ejecución en Windows/Supabase/Cloudflare: main f11fe8a, tres verificadores superados, repair 202610230003 y publicación https://7faeb857.cibuspan-one.pages.dev. Sólo instalación/verificación/publicación confirmadas; validación operativa, consumos anteriores y automatizaciones restantes pendientes. Ver docs/CONSUMO_MP_PRODUCCION.md para alcance, límites, comandos y evidencia. Etapa 3 abierta.


## OP-02 preparado el 27/10/2026: guardado completo de pedidos

Tras dejar el conteo/arranque físico ORG-07 en pausa, Iván autoriza seguir con el siguiente paso. Se implementa alta de pedido en una sola transacción, comprobante privado por solicitud/usuario y recuperación de respuesta perdida. Mantiene pedido y sus líneas juntos y rechaza INSERT separado desde clientes viejos. Alcance global del número conservado, sin índice nuevo ni deduplicación histórica. Ver docs/REGISTRO_PEDIDOS_SEGURO.md para reglas y límites. Código y SQL 202610270001 instalados/verificados/publicados según terminal del 27/10/2026: https://fbafd456.cibuspan-one.pages.dev y mensaje final del instalador de pedidos, sin importar registros ni cambiar stock. No repetir instalación ni pedir esa terminal. Falta validación operativa con pedidos reales. Los controles instalados anteriores y la pausa de ORG-07 se conservan. No hubo altas ni cambios de stock reales desde aquí. Etapa 3 abierta; eliminación transaccional y decisiones OP-03/09/14 pendientes.
