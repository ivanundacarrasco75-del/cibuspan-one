# Preparar y liberar reservas con recuperación

Entrega preparada e instalada el 04/11/2026. Continuación de ORG-06/08 y OP-10, después de eliminación completa y confirmación de despacho (202610270002). Iván compartió posteriormente la terminal de publicación; la evidencia se registra abajo.

## Estado y alcance

Código/SQL preparados en main y probados localmente. Instalación, siete verificaciones de metadatos, registro de migración y publicación confirmados por la terminal de Iván del 04/11/2026, Cloudflare https://71953738.cibuspan-one.pages.dev y mensaje final del instalador. La aceptación operativa con usuarios reales sigue pendiente. El arranque físico ORG-07 y la regularización histórica siguen EN PAUSA. La instalación no preparó ni liberó pedidos ni cambió stock según el resultado comunicado.

Ahora las cuatro acciones del flujo usan intentos persistidos: eliminar pedido, preparar, liberar reserva y confirmar despacho. La preparación/liberación usa sus comprobantes privados propios; comparte el panel y bloqueo de intentos del navegador con eliminación/despacho. No se cambia la regla de parcial, el alcance de numeración ni el stock mínimo.

## Flujo del usuario

1. Elegir pedido y cantidades. La revisión de sólo lectura verifica el pedido actual, sus líneas, reservas, lotes elegibles y cantidades reservadas por otros pedidos.
2. Confirmar “Preparar”: muestra unidades, total pedido y Fill Rate previsto. Sólo reserva por FEFO; no descuenta stock físico ni agrega un movimiento de entrada/salida.
3. “Liberar reserva”: muestra unidades a liberar y confirma que el pedido volverá a INGRESADO. Conserva reserva y asignaciones como historia; devuelve disponibilidad sin aumentar el stock físico.
4. Si se pierde una respuesta, la app consulta el mismo intento. Si no puede comprobarlo, muestra el panel existente y bloquea nuevas operaciones de esas pantallas hasta reintentar/comprobar. Conserva este navegador y su almacenamiento; no repetir desde otro dispositivo para resolver una incertidumbre.

Reintentar conserva el mismo UUID y datos. Recuperar una preparación ya liberada devuelve el comprobante original sin crear otra reserva. Recuperar una liberación antigua no libera una reserva nueva del mismo pedido. El comprobante describe lo ocurrido; la lista se vuelve a leer para ver el estado actual. El mensaje de éxito ya no desaparece al refrescar el detalle desde la propia acción.

“Comprobar para corregir” consulta bajo el mismo bloqueo y sella la ausencia como ANULADA. Una ejecución atrasada con ese UUID queda rechazada. Después se revisa el pedido actual; no se reaplica un token antiguo automáticamente. Cancelar la confirmación antes del envío no crea solicitud ni reserva. Los borradores normales no ganan guardado automático.

## Contrato del servidor

SQL `supabase/migrations/202611040001_reservas_recuperables.sql`:

- Tabla privada `res_solicitudes_operacion`: actor, tipo PREPARAR/LIBERAR, datos normalizados, snapshot previo, transacción, estado EJECUTANDO/CONFIRMADA/ANULADA y comprobante. RLS y sin acceso directo de roles API; no se vincula con FK que borre el comprobante al cambiar un documento.
- APIs `prever_operacion_reserva(text,jsonb)`, `ejecutar_operacion_reserva(uuid,text,jsonb,text,uuid)` y `resolver_operacion_reserva(uuid,text,uuid)`. Mantienen permisos Pedidos/Despachos y perfil activo. Ejecutar/resolver exigen UID real y usuario esperado; otro actor no recupera la solicitud.
- Revisión READ ONLY con huella de pedido, detalles, reservas, lotes candidatos y asignaciones activas que los ocupan. Incluye día local y SQL. Se verifican todas las líneas, ceros explícitos, IDs propios sin repetir, enteros/múltiplos, total cabecera y cantidades pedidas. Para liberar se exige una sola reserva ACTIVA con pedido PREPARADO.
- Disponibilidad por múltiplos completos de cada lote, sin sumar sobrantes incompatibles; lotes vencidos excluidos conforme a la función instalada (`current_date`). FEFO conserva el cuerpo instalado. No se redefine aquí su zona horaria ni política de vida útil.
- Antes de ejecutar se bloquean solicitud, pedido y detalles; liberar bloquea reserva/asignaciones, preparar serializa preparaciones recuperables y bloquea lotes candidatos frente a salidas/ajustes. Si cambió el estado revisado, exige revisión nueva. El reintento confirmado se resuelve antes de consultar estado actual.
- En la misma transacción se ejecuta la función vigente de preparar o liberar y se valida ID/estado/cantidades resultantes antes de confirmar el comprobante. Fallos tardíos revierten reserva, asignaciones, pedido y comprobante juntos. No se recalculan recetas ni saldos.
- Se inserta una compuerta después de OP-12 en `reservar_pedido_fefo_parcial` y `liberar_reserva_fefo`, usando `pg_get_functiondef`. Preserva cuerpo, firma, propietario, configuración y grants. Una solicitud privada debe coincidir en actor/transacción/objeto/cantidades; un GUC inventado no autoriza. No se copia el dump del usuario.
- Trigger adicional en reservas protege INSERT y transición a LIBERADA. Clientes anteriores ya no pueden usar las dos llamadas antiguas sueltas. Permanecen los controles anteriores de eliminación/confirmación y el mantenimiento SQL autorizado sin UID. No se presenta como una revisión nueva de todas las políticas o escrituras directas de cada tabla.

No se migran intentos antiguos no registrados por este protocolo, ni se crean comprobantes retrospectivos. Las reservas existentes siguen siendo legibles y pueden liberarse mediante el nuevo flujo si su estado es consistente. El intento nuevo de liberación conserva el snapshot anterior.

## Instalar y publicar

Desde `D:\CIBUSPAN_ONE`, actualizar main y ejecutar `scripts/Instalar-ReservasRecuperables.ps1`. Compila primero, aplica exclusivamente 202611040001, exige siete diagnósticos de metadatos, registra sólo esa versión y publica el proyecto existente cibuspan-one/main. No añade dependencias ni ejecuta db push, conteos, importaciones u operaciones de ensayo en vivo.

Requiere 202610270002 ya instalado. Si el preflight indica que falta, completar `Instalar-OperacionesLogistica.ps1` y después ejecutar este instalador. No reinstalar paquetes anteriores por rutina ni modificar su historial para forzar la instalación. Si SQL termina y falla Cloudflare, completar la publicación y cerrar/abrir la PWA: las llamadas antiguas quedan bloqueadas; no retirar la protección para conservar un cliente viejo.

Mensaje final recibido el 04/11/2026: “Reservas recuperables instaladas, verificadas y publicadas. No se prepararon ni liberaron pedidos y no se cambio stock.” Se confirma el alcance de instalación/verificación/publicación; también el prerrequisito 202610270002 instalado/verificado según los siete diagnósticos. El fragmento no muestra git log: no atribuir un SHA de compilación ni una publicación anterior independiente. No pedir nuevamente esta terminal ni reinstalar los paquetes. Cerrar/abrir la PWA para cargar el cliente publicado.

## Verificación

179 pruebas locales pasan: 105 del escenario SQL exportado y 74 de cliente/regresiones. TypeScript/Vite/PWA compilan. No cambiaron dependencias, rutas, menú ni DashboardV2/Finanzas.

Escenarios nuevos: previa READ ONLY en ambos tipos; reserva/liberación sin cambiar físico/Kardex; repetición/resolución; preparación recuperada después de liberar; liberación recuperada tras preparar otra reserva; otra clave sobre estado ya cambiado; revisión obsoleta por pedido/stock/otra reserva; cobertura/enteros/múltiplos/caducidad; sobrantes por lote y asignación FEFO; rollback tardío en ambas acciones; llamada antigua/GUC/INSERT/transición directa rechazados; ausencia sellada; integración con confirmación OP-10; UID/actor/permisos/tabla y ayudantes privados; reinstalación CRLF y de los seis paquetes previos conservando siete diagnósticos. El diagnóstico detecta trigger deshabilitado y EXECUTE anónimo.

Cliente: las cuatro clases comparten copia antes del envío y recuperación; nuevas pruebas cubren normalización, recarga/bloqueo entre tipos, respuesta perdida, cantidades y UUID del comprobante, doble clic, cambio de datos y cierre sin ejecución. Se conservan regresiones de alta de pedidos, importaciones, producción y arranque.

Las pruebas SQL usan PGlite aislado y el exportado privado del 23/10; los defaults/auxiliares de ensayo están modelados. No se publica el exportado. No certifican varias conexiones PostgreSQL reales ni HTTP concurrente, recorrido visual en navegador o aceptación por empleados. No se consultaron pedidos ni se escribieron datos de la base real desde aquí. La serialización/bloqueos se verifican por contrato y casos secuenciales, sin afirmar una prueba de carrera multiconexión.

Reproducir el escenario con `CIBUSPAN_PROBAR_RESERVA=1`, `CIBUSPAN_AUDIT_FILE` apuntando al diagnóstico privado y `CIBUSPAN_SQL_TEST_MODULE` al PGlite disponible, ejecutando `node --test pruebas/verificar_flujo_servidor_exportado.mjs`. Las regresiones de cliente usan `node --test` con verificar_operaciones_logistica, verificar_registro_pedidos_seguro, verificar_registro_produccion_seguro, verificar_arranque_operativo y verificar_pedidos_octubre. Finalizar con `npm run build`.

## Siguiente

Validar el circuito real cuando corresponda; instalación/verificación/publicación ya confirmadas. Esta actualización es sólo documental y no requiere volver a publicar. Etapa 3 permanece abierta; OP-09 parcial, OP-03 numeración y stock mínimo requieren definición antes de cambiar reglas. Micros/empaque y demás pendientes de la auditoría siguen abiertos. No reanudar arranque físico o reconstrucción histórica por esta entrega.
