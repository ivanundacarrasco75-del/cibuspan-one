# Correos al guardar descuentos

Implementación del 22 de octubre de 2026. Requiere instalar la migración nueva y desplegar la función; publicar sólo el frontend no activa los correos.

## Flujo

En Descuentos, seleccionar usuarios activos con correo antes de Guardar. El guardado registra promoción y avisos en la misma transacción. Sin destinatarios se guarda sin correos. La selección se mantiene durante la sesión de la pantalla para el siguiente descuento, y se puede cambiar antes de guardar. El registro de envíos conserva los destinatarios de cada descuento; no hay envíos retroactivos a promociones anteriores.

Correo con nombre, cliente, vigencia, cada SKU y producto, porcentaje o valor USD por unidad y observaciones. El contenido se obtiene de las tablas guardadas, no de texto de correo arbitrario enviado por el navegador. No se envía a personas no seleccionadas. Direcciones iguales se agrupan, incluso si corresponden a dos perfiles. Límite 50 usuarios por descuento.

PENDIENTE: registrado sin confirmación de envío. ENVIANDO: reclamado por el servidor. ENVIADO: el proveedor aceptó el correo; no confirma entrega, lectura ni ausencia de rebote. ERROR: envío no confirmado. Usar Reintentar envío, nunca volver a guardar el descuento para reenviar.

## Instalar en el proyecto Supabase vinculado

Revisar y ejecutar únicamente la migración nueva:

```powershell
npx supabase db query --linked --file ".\supabase\migrations\202610220001_descuentos_correo.sql"
# Sólo si terminó correctamente:
npx supabase migration repair 202610220001 --status applied --linked
npx supabase functions deploy descuentos-correo
```

Mantener verificación de JWT de la función. También valida getUser y permiso del usuario en servidor. No usar --no-verify-jwt sin revisar la configuración real del proyecto. Los usuarios necesitan los permisos existentes para guardar promociones (Reportes o Administración). Este cambio no amplía permisos de escritura.

## Configurar remitente

Adaptador implementado: Resend. Definir remitente aprobado por la empresa, verificar dominio en el proveedor y generar clave de envío. En Supabase Dashboard → Edge Functions → Secrets configurar:

- RESEND_API_KEY: clave de envío del proveedor.
- DESCUENTOS_EMAIL_FROM: dirección verificada, por ejemplo `CIBUSPAN <avisos@dominio-de-la-empresa>`.

No poner estas claves en VITE_*, archivos versionados, el navegador o el chat. SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY son variables propias del entorno Edge Functions; no exponer service_role al frontend. Sin remitente/clave la promoción se conserva y el envío sigue pendiente. El agente no configuró ni probó credenciales reales.

Documentación del proveedor: https://resend.com/docs/api-reference/emails/send-email y https://resend.com/docs/dashboard/emails/idempotency-keys.

## Publicar frontend

Después de instalar base, función y secrets:

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

Para probar, crear un descuento autorizado y seleccionar únicamente el destinatario real que deba recibir esa comunicación. No se enviaron correos durante el desarrollo.

## Reintentos y límites

UUID por solicitud de guardado impide crear otra promoción/cola al repetir la misma solicitud sin cambios. Modificar los datos prepara otra solicitud; antes de crear otra promoción tras un fallo de red comprobar el historial. El servidor reclama cada aviso con comparación de estado/fecha y usa Idempotency-Key estable por aviso. Una segunda ejecución no reenvía ENVIADO. ENVIANDO reciente no se reclama otra vez; después de diez minutos puede recuperarse con la misma clave. La ventana de reintento automática en el servidor está limitada a 23 horas desde primer intento, dentro de las 24 horas de retención de claves del proveedor. Fuera de esa ventana se requiere revisar el proveedor antes de cualquier reenvío para evitar duplicados. No cambiar remitente ni contenido en medio de un reintento.

El guardado inicia el envío desde la app mediante Edge Function. Si se cierra la página antes de invocarla, queda PENDIENTE y se recupera con Reintentar; no hay cron ni garantía de envío autónomo con la app cerrada. No hay seguimiento de rebotes/entregas sin configurar webhooks del proveedor. El historial de pantalla muestra los últimos 200 avisos.

## Validación realizada

Compilación frontend; SQL ejecutado en PostgreSQL local PGlite con el RPC original de promociones; atomicidad, destinatarios válidos/activos, rollback, permisos, duplicación de solicitud, otros datos/mismo ID y otro usuario/mismo ID. Pruebas del worker real transpilan TypeScript con cliente/proveedor simulados: no envía sin configuración/permiso, conserva errores, no repite ENVIADO, usa clave estable y respeta ventana/claim. Generación de mensaje probada con porcentaje y USD/unidad. No ejecución ni prueba de correo en producción.
