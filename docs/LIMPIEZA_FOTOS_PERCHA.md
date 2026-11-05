# Retirar fotos físicas de perchas y conservar capturas En Percha

## Decisión del propietario, 05/11/2026

Iván autorizó prescindir de las fotos físicas de perchas. Solo le interesa conservar las capturas de la app En Percha. Esta autorización permite una limpieza selectiva distinta del traslado R2: no obliga a respaldar las fotos físicas descartables y no autoriza a borrar capturas, pedidos, inventario ni datos de visitas.

Situación observada: R2 ya instalado/publicado en `ee9dcaf5`, depósito privado y firma presentes. El inicio de sesión sigue bloqueado por Supabase `exceed_storage_size_quota`. Organización CIBUSPAN en Free; Usage reporta 4,244 / 1 GB de Storage y base de datos 0,11 / 0,5 GB, ciclo 31/10–30/11/2026. El uso de Storage del ciclo no equivale necesariamente al tamaño físico actual.

## Preparación y clasificación

`scripts/Revisar-FotosPercha.ps1` consulta mediante el CLI enlazado que Iván ya tiene instalado. No necesita iniciar sesión en la PWA ni compartir claves por chat.

- El SQL en `supabase/diagnosticos/diagnostico_fotos_percha.sql` es exclusivamente de lectura. Obtiene metadatos de `visitas-campo` y todas las rutas referenciadas por `com_visitas_campo_sku.capturas_app`, sin restringir por usuario, cliente, fecha, estado ni revisión.
- Son candidatas únicamente rutas con el formato de la app `usuario/fecha/percha-...png|jpg|jpeg|webp`, en el bucket exacto `visitas-campo` y ausentes de todas las referencias de capturas. También incluye subidas de ese tipo que quedaron sin referencia después de un intento de guardado.
- Una ruta en `capturas_app` se protege incluso si su nombre dice `percha-`. Los nombres `captura-`, `captura-r2-`, los archivos no identificados y otros buckets no se borran.
- Esto distingue el origen/categoría registrados por la aplicación, no inspecciona visualmente el contenido de cada imagen. Archivos que una persona haya subido en el campo equivocado pueden requerir revisión adicional. No ofrecer un borrado de bucket completo ni de carpetas por fecha/usuario, pues mezclan ambas clases de evidencia.
- Los tamaños proceden de metadatos y son aproximados. Un tamaño desconocido se informa como desconocido. No presentarlos como nueva cuota facturable ni prometer que dejarán de excederse todos los límites de la organización.

## Primer paso: solo diagnóstico

```powershell
& {
    $ErrorActionPreference = "Stop"
    Set-Location "D:\CIBUSPAN_ONE"
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "Fallo la actualizacion. No continuar." }
    & ".\scripts\Revisar-FotosPercha.ps1"
}
```

Mostrar a Iván el resumen antes de iniciar la limpieza. El script guarda un informe local en `diagnosticos_privados/fotos_percha_FECHA/`, excluido de Git. No guarda credenciales. No requiere instalar SQL, reparar migraciones, cambiar el plan ni publicar en Cloudflare.

## Segundo paso: limpieza selectiva ya autorizada

Después de revisar la clasificación y el espacio potencial, ejecutar el mismo script con `-Eliminar`:

```powershell
& {
    $ErrorActionPreference = "Stop"
    Set-Location "D:\CIBUSPAN_ONE"
    & ".\scripts\Revisar-FotosPercha.ps1" -Eliminar
}
```

La eliminación es irreversible para las fotos descartadas. Este parámetro se entrega como una acción separada del diagnóstico para revisar primero un resultado concreto; la autorización de Iván para perder fotos físicas ya consta y no debe pedirse otra vez por rutina.

- Verifica el `project-ref` enlazado `mkntfvsbmlgobettavnu` y fija el mismo identificador en Storage si el CLI admite `--project-ref`.
- Antes de cada lote de hasta 25 archivos relee el estado. Solo retira objetos de la selección inicial con el mismo ID, ruta, actualización y tamaño. Si cambian las referencias a capturas o los archivos, se detiene para revisar.
- Usa `supabase storage rm` por rutas individuales con `--linked --experimental`; no usa `-r`, comodines ni borrado por SQL. Cada lote queda en el informe antes de enviarse y se comprueba después con una nueva consulta de metadatos.
- No toca filas de visitas ni sus datos/ubicación. Conserva las referencias históricas a las fotos descartadas como trazabilidad; esas imágenes ya no abrirán. No afecta las referencias `capturas_app`, el OCR o sus revisiones.
- Si Storage devuelve cuota/HTTP 402, permisos o una respuesta incierta, se detiene sin enviar más lotes. No afirmar que no se eliminó ninguna foto si un lote ya se envió: reconsultar el diagnóstico. No se elude una restricción del proveedor con esta herramienta.
- Tras una respuesta correcta, no anuncia éxito si la foto sigue en metadatos; también comprueba que el conjunto de referencias a capturas y sus objetos presentes se conserven.

Aunque se consiga retirar fotos, el proyecto puede continuar restringido por la cuota acumulada del ciclo. Si la API de Storage también está bloqueada o la restricción no se levanta, consultar a soporte para solicitar su evaluación. No garantizar desbloqueo gratuito inmediato ni contratar Pro sin decisión del propietario.

## Verificación y estado

Preparado, sin ejecución en la cuenta real: 8 pruebas de clasificación/reintentos/CLI y 3 pruebas SQL aisladas con PGlite, incluida consulta en transacción de solo lectura, archivo mayor de 2 GB, referencias cruzadas y tamaños desconocidos. Build de la app aprobado. PowerShell revisado; su ejecución en Windows y el comportamiento del Storage real con la restricción están pendientes. No se borraron ni trasladaron archivos durante el desarrollo.

Referencias oficiales:

- https://supabase.com/docs/reference/cli/supabase-storage-rm
- https://supabase.com/docs/guides/platform/manage-your-usage/storage-size
- https://supabase.com/kb/troubleshooting/storage-unexpectedly-high-usage-or-exceed_storage_size_quota-errors-ae21a5


### Limpieza rechazada por cuota: HTTP 402 confirmado — 05/11/2026

Iván ejecutó el diagnóstico: 959 fotos físicas candidatas, 3792,91 MiB conocidos aproximadamente y 1817 rutas referenciadas protegidas. Resultado local guardado en `diagnosticos_privados/fotos_percha_20261105_123037_852/plan_solo_lectura.json`. Este diagnóstico fue de solo lectura.

Después ejecutó `Revisar-FotosPercha.ps1 -Eliminar` y entregó el error original: `Error status 402` con `exceed_storage_size_quota`. El script terminó en su protección «Storage rechazo el borrado o no confirmo el resultado», sin continuar con otros lotes. La API del proveedor está bloqueando también el retiro de objetos; no atribuirlo a PowerShell, a lectura OCR ni a los permisos de la app. No se confirmó ninguna eliminación; no afirmar que se liberó espacio ni que se borraron las 959 fotos. Si luego hace falta el estado exacto, volver a consultar el diagnóstico sin `-Eliminar`.

No recomendar repetir el mismo borrado, añadir `--debug` para intentar desbloquearlo, borrar filas `storage.objects`/`storage.buckets` por SQL, vaciar el bucket entero ni crear otra app como atajo. La autorización sigue limitada a fotos físicas de percha; todas las capturas de En Percha y los datos de negocio deben conservarse.

Siguiente vía gratuita por intentar: Iván puede abrir soporte de Supabase y solicitar que evalúen acceso temporal a la API de Storage o un procedimiento soportado para retirar únicamente las fotos descartables, conservando las capturas. Preparar el texto para que él lo copie; no enviar solicitudes externas sin su instrucción explícita. No asegurar que soporte concederá el acceso o responderá antes del lunes. Pro continúa como opción inmediata documentada, pero Iván no lo ha contratado ni autorizado. Esperar el ciclo tampoco garantiza resolverlo si el uso permanece alto.

Este registro solo documenta evidencia del propietario; no cambia código, no ejecuta limpieza ni requiere SQL/publicación. El inicio de sesión, traslado R2 y arranque operativo continúan pendientes de recuperar acceso y verificarse con datos reales.


### Requerimiento a soporte enviado por Iván — 05/11/2026

Iván confirmó «ok esta enviado el requerimiento» después de completar el formulario de soporte. Registrar como enviado por el propietario y pendiente de respuesta, no como enviado por el agente ni como desbloqueo concedido. No se conoce número de ticket ni plazo. No pedirle que lo abra otra vez ni enviar duplicados por rutina.

La solicitud pide que Supabase evalúe acceso temporal/procedimiento soportado para eliminar exclusivamente las fotos físicas descartables, conservando capturas de En Percha y datos del negocio. R2 continúa publicado; no hay confirmación de traslado o eliminación, la app sigue pendiente de recuperar acceso y Pro no ha sido contratado/autorizado. Conservar capturas originales en los teléfonos mientras no se confirme su guardado. Cuando llegue la respuesta, revisar instrucciones y alcance antes de proceder; no anticipar limpieza, restablecimiento, fecha de solución ni salida operativa del lunes. Este cambio es solo documental y no necesita instalar ni publicar de nuevo.
